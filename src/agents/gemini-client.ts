import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import crypto from 'crypto';

export const FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-3.1-flash-lite';
export const STRONG_MODEL = process.env.GEMINI_STRONG_MODEL || 'gemini-3.1-flash-lite';

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

function computeCacheKey(model: string, systemPrompt: string | undefined, prompt: string): string {
  const content = `${model}:::${systemPrompt || ''}:::${prompt}`;
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

export async function callGeminiStructured<T>(params: {
  model?: string;
  systemPrompt?: string;
  prompt: string;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  const model = params.model || FAST_MODEL;
  const cacheKey = computeCacheKey(model, params.systemPrompt, params.prompt);

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

  // Try chosen model, fallback to FAST_MODEL if strong model fails
  const modelsToTry = [model];
  if (model !== FAST_MODEL) {
    modelsToTry.push(FAST_MODEL);
  }

  for (const m of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: params.prompt,
        config,
      });

      rawResponseText = response.text || '';
      if (rawResponseText) break;
    } catch (err: any) {
      lastError = err;
      // Exponential brief pause on transient error
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  if (!rawResponseText) {
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
