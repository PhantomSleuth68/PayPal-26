import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import crypto from 'crypto';

export const FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-3.5-flash-lite';
export const STRONG_MODEL = process.env.GEMINI_STRONG_MODEL || 'gemini-3.5-flash-lite';
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';

export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const callCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let genAIClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing from environment variables');
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

function computeCacheKey(systemPrompt: string | undefined, prompt: string): string {
  const content = `${systemPrompt || ''}:::${prompt}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Checks whether an error from the Gemini API is a retryable 503/429 or network error.
 */
export function isRetryableAiError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code || err.error?.code;
  if (status === 503 || status === 429) return true;

  const msg = (err.message || String(err)).toLowerCase();
  if (msg.includes('503') || msg.includes('429')) return true;
  if (msg.includes('unavailable') || msg.includes('resource_exhausted')) return true;
  if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('too many requests')) return true;
  if (
    msg.includes('fetch failed') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('eai_again') ||
    msg.includes('socket hang up') ||
    msg.includes('network error') ||
    msg.includes('timeout')
  ) {
    return true;
  }
  return false;
}

async function generateWithTimeout(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  config: any,
  timeoutMs = 30000
): Promise<{ text?: string }> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<{ text?: string }>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`ETIMEDOUT: Gemini call to ${model} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      ai.models.generateContent({ model, contents: prompt, config }),
      timeoutPromise,
    ]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

export async function callGeminiStructured<T>(params: {
  model?: string;
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  const primaryModel = params.model || FAST_MODEL;
  const fallbackModel = primaryModel === FALLBACK_MODEL ? FAST_MODEL : FALLBACK_MODEL;
  const cacheKey = computeCacheKey(params.systemPrompt, params.prompt);

  // Check cache
  const cached = callCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return params.schema.parse(cached.data);
  }

  const ai = getGenAIClient();

  const config: {
    systemInstruction?: string;
    responseMimeType?: string;
  } = {};

  if (params.systemPrompt) {
    config.systemInstruction = params.systemPrompt;
  }
  config.responseMimeType = 'application/json';

  let rawResponseText = '';
  let lastError: any = null;

  // 1. Primary model with exponential backoff (3 attempts: ~1s, ~2s backoff)
  const retryDelaysMs = [1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await generateWithTimeout(ai, primaryModel, params.prompt, config, 30000);
      rawResponseText = response.text || '';
      if (rawResponseText) break;
    } catch (err: any) {
      lastError = err;
      if (!isRetryableAiError(err)) {
        throw err;
      }

      if (attempt < 2) {
        const delay = retryDelaysMs[attempt];
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 2. If primary model still fails, try fallback model before giving up
  if (!rawResponseText) {
    try {
      const fbResponse = await generateWithTimeout(ai, fallbackModel, params.prompt, config, 30000);
      rawResponseText = fbResponse.text || '';
    } catch (fbErr: any) {
      lastError = fbErr;
    }
  }

  if (!rawResponseText) {
    if (lastError && isRetryableAiError(lastError)) {
      throw new AiUnavailableError(
        `AI_UNAVAILABLE: Gemini service is currently unavailable or rate limited (503/429) after all retry attempts on ${primaryModel} and fallback model ${fallbackModel}. Last error: ${lastError.message}`,
        lastError
      );
    }
    throw new Error(
      `Gemini generation failed: ${lastError?.message || 'Empty response from model'}`
    );
  }

  const cleaned = cleanJsonText(rawResponseText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Gemini output as JSON: ${(err as Error).message}\nRaw text: ${cleaned.slice(0, 300)}`
    );
  }

  const validated = params.schema.parse(parsed);

  // Cache result
  callCache.set(cacheKey, {
    data: validated,
    timestamp: Date.now(),
  });

  return validated;
}
