import {
  AuditLogEntry,
  AuditorVerdict,
  Decision,
  InjectionResult,
  Policy,
  PolicyEvaluationResult,
  PurchaseProposal,
  RuleTrace,
  SpendRecord,
} from './types';
import { mockProductProvider } from '../providers/products/mock-provider';
import { ProductListing } from '../providers/products/types';
import { shopForProduct } from '../agents/shopper';
import { detectInjection } from '../agents/injection-shield';
import { auditProposal } from '../agents/auditor';
import { evaluatePolicy } from './policy-engine';
import { paypalProvider } from '../providers/payment/paypal-provider';
import {
  getActivePolicy,
  getSpendHistory,
  logAuditEvent,
  recordSpend,
  saveOrderRecord,
  createApproval,
  isKillSwitchActive,
} from './db';
import { callGeminiStructured, FAST_MODEL, AiUnavailableError, isRetryableAiError } from '../agents/gemini-client';
import { z } from 'zod';

export interface PipelineStageResult {
  stage: 'search' | 'shopper' | 'injection_check' | 'auditor' | 'policy_engine' | 'execution';
  name: string;
  status: 'pending' | 'running' | 'passed' | 'escalated' | 'blocked';
  summary: string;
  details?: unknown;
  durationMs?: number;
}

export interface PipelineExecutionResult {
  requestId: string;
  userRequest: string;
  decision: Decision;
  stages: PipelineStageResult[];
  matchedListings?: ProductListing[];
  proposal?: PurchaseProposal;
  injectionResult?: InjectionResult;
  auditorVerdict?: AuditorVerdict;
  evaluationResult?: PolicyEvaluationResult;
  approvalId?: string;
  orderId?: string;
  captureId?: string;
  approvalUrl?: string;
  error?: string;
}

const SummaryOutputSchema = z.object({
  summary: z.string(),
});

async function generateHumanApprovalSummary(
  request: string,
  proposal: PurchaseProposal,
  evaluation: PolicyEvaluationResult,
  auditor?: AuditorVerdict
): Promise<string> {
  const prompt = `
Generate a concise, one-paragraph summary (under 4 sentences) for a human decision-maker explaining why this purchase proposal was escalated for manual review and what action is required.

Original Request: "${request}"
Item: ${proposal.items[0]?.title}
Total: $${proposal.total.toFixed(2)}
Seller: ${proposal.seller.name} (Rating: ${proposal.seller.rating})
Escalation Reason: ${evaluation.requiresHumanReason || 'Exceeds auto-approval threshold'}
Auditor Verdict: ${auditor?.verdict} (${auditor?.reasons.join(', ')})
`;

  try {
    const res = await callGeminiStructured({
      model: FAST_MODEL,
      prompt,
      schema: SummaryOutputSchema,
    });
    return res.summary;
  } catch {
    return `Purchase of "${proposal.items[0]?.title}" for $${proposal.total.toFixed(2)} from ${proposal.seller.name} exceeds the automatic approval threshold ($50.00) or was flagged for manual review: ${evaluation.requiresHumanReason || 'Human approval required.'}`;
  }
}

export async function runShoppingPipeline(
  userRequest: string,
  options?: {
    customPolicy?: Policy;
    forcedListings?: ProductListing[];
    autoCapturePayPal?: boolean;
    customSpendHistory?: SpendRecord[];
    recordSpendInDb?: boolean;
    runId?: string;
  }
): Promise<PipelineExecutionResult> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const runId = options?.runId;
  const stages: PipelineStageResult[] = [];
  const policy = options?.customPolicy || getActivePolicy();
  const spendHistory = options?.customSpendHistory !== undefined ? options.customSpendHistory : getSpendHistory();

  // Log start
  logAuditEvent(
    {
      id: `audit_start_${requestId}`,
      timestamp: new Date().toISOString(),
      eventType: 'SEARCH',
      summary: `User submitted purchase request: "${userRequest}"`,
      details: { requestId, userRequest, runId },
      runId,
    },
    runId
  );

  // Stage 1: Product Search
  const t0 = Date.now();
  let matchedListings: ProductListing[] = [];
  try {
    matchedListings = options?.forcedListings?.length
      ? options.forcedListings
      : await mockProductProvider.search({ query: userRequest });

    if (matchedListings.length === 0) {
      matchedListings = await mockProductProvider.getAll();
    }

    stages.push({
      stage: 'search',
      name: 'Merchant Catalog Search',
      status: 'passed',
      summary: `Discovered ${matchedListings.length} matching listing(s) in catalog`,
      details: matchedListings.map((l) => ({ id: l.id, title: l.title, price: l.price })),
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    stages.push({
      stage: 'search',
      name: 'Merchant Catalog Search',
      status: 'blocked',
      summary: `Catalog search failed: ${err.message}`,
      durationMs: Date.now() - t0,
    });
    return { requestId, userRequest, decision: 'BLOCK', stages, error: err.message };
  }

  // Stage 2: Shopper Agent
  const t1 = Date.now();
  let proposal: PurchaseProposal;
  try {
    const shopResult = await shopForProduct(userRequest, matchedListings);
    proposal = shopResult.proposal;

    logAuditEvent({
      id: `audit_prop_${requestId}`,
      timestamp: new Date().toISOString(),
      eventType: 'PROPOSAL',
      summary: `Shopper proposed: ${proposal.items[0]?.title} ($${proposal.total.toFixed(2)}) from ${proposal.seller.name}`,
      details: proposal,
    });

    stages.push({
      stage: 'shopper',
      name: 'Autonomous Shopper Agent',
      status: 'passed',
      summary: `Selected "${proposal.items[0]?.title}" for $${proposal.total.toFixed(2)} (Qty: ${proposal.quantity})`,
      details: {
        item: proposal.items[0]?.title,
        price: proposal.total,
        seller: proposal.seller.name,
        reasoning: proposal.reasoning,
      },
      durationMs: Date.now() - t1,
    });
  } catch (err: any) {
    const isAiUnavailable =
      err instanceof AiUnavailableError ||
      err.code === 'AI_UNAVAILABLE' ||
      isRetryableAiError(err) ||
      err.message?.includes('AI_UNAVAILABLE');

    const errorMessage = isAiUnavailable ? 'AI_UNAVAILABLE' : err.message;
    const blockingReason = isAiUnavailable
      ? 'AI_UNAVAILABLE: Autonomous shopper service unavailable after retries (503/429). Fail-closed safeguard engaged.'
      : `Shopper agent error: ${err.message}`;

    stages.push({
      stage: 'shopper',
      name: 'Autonomous Shopper Agent',
      status: 'blocked',
      summary: blockingReason,
      durationMs: Date.now() - t1,
    });

    const fallbackEvaluation: PolicyEvaluationResult = {
      decision: 'BLOCK',
      ruleTrace: [
        {
          ruleId: isAiUnavailable ? 'AI_UNAVAILABLE' : 'SHOPPER_ERROR',
          name: 'AI Shopper Availability Guardrail',
          passed: false,
          verdict: 'BLOCK',
          reason: blockingReason,
        },
      ],
      summary: `Transaction BLOCKED: ${blockingReason}`,
      blockingReason: isAiUnavailable ? 'AI_UNAVAILABLE' : blockingReason,
    };

    return {
      requestId,
      userRequest,
      decision: 'BLOCK',
      stages,
      matchedListings,
      error: errorMessage,
      evaluationResult: fallbackEvaluation,
    };
  }

  // Stage 3: Injection Shield
  const t2 = Date.now();
  const textToScan = [
    ...matchedListings.map((l) => `${l.title} ${l.description}`),
    proposal.reasoning,
  ].join('\n');

  const injectionResult = await detectInjection(textToScan, 'candidate listings');

  logAuditEvent({
    id: `audit_inj_${requestId}`,
    timestamp: new Date().toISOString(),
    eventType: 'INJECTION_CHECK',
    summary: injectionResult.injectionDetected
      ? `INJECTION DETECTED: ${injectionResult.evidence.join('; ')}`
      : 'Injection Shield passed: no adversarial instructions detected.',
    details: injectionResult,
    decision: injectionResult.injectionDetected ? 'BLOCK' : 'AUTO_APPROVE',
  });

  stages.push({
    stage: 'injection_check',
    name: 'Prompt Injection Shield',
    status: injectionResult.injectionDetected ? 'blocked' : 'passed',
    summary: injectionResult.injectionDetected
      ? `ADVERSARIAL ATTACK DETECTED: ${injectionResult.evidence[0] || 'Prompt injection signatures found'}`
      : 'No prompt injection signatures detected in listing text.',
    details: injectionResult,
    durationMs: Date.now() - t2,
  });

  // Stage 4: Auditor Agent
  const t3 = Date.now();
  const auditorVerdict = await auditProposal({
    proposal,
    rawListings: matchedListings,
    policy,
    originalRequest: userRequest,
    recentPurchases: spendHistory,
  });

  logAuditEvent({
    id: `audit_aud_${requestId}`,
    timestamp: new Date().toISOString(),
    eventType: 'AUDITOR_VERDICT',
    summary: `Auditor verdict [${auditorVerdict.verdict.toUpperCase()}]: ${auditorVerdict.reasons.join('; ')}`,
    details: auditorVerdict,
  });

  stages.push({
    stage: 'auditor',
    name: 'Independent Adversarial Auditor',
    status:
      auditorVerdict.verdict === 'block'
        ? 'blocked'
        : auditorVerdict.verdict === 'escalate'
          ? 'escalated'
          : 'passed',
    summary: `Auditor verdict: ${auditorVerdict.verdict.toUpperCase()} - ${auditorVerdict.reasons[0] || 'No anomalies found'}`,
    details: auditorVerdict,
    durationMs: Date.now() - t3,
  });

  // Stage 5: Deterministic Policy Engine
  const t4 = Date.now();
  const evaluationResult = evaluatePolicy(
    policy,
    proposal,
    spendHistory,
    auditorVerdict,
    injectionResult
  );

  logAuditEvent({
    id: `audit_pol_${requestId}`,
    timestamp: new Date().toISOString(),
    eventType: 'POLICY_EVALUATION',
    summary: `Policy Engine decision: ${evaluationResult.decision}. ${evaluationResult.summary}`,
    details: { evaluationResult },
    ruleTrace: evaluationResult.ruleTrace,
    decision: evaluationResult.decision,
  });

  stages.push({
    stage: 'policy_engine',
    name: 'Deterministic Policy Engine',
    status:
      evaluationResult.decision === 'BLOCK'
        ? 'blocked'
        : evaluationResult.decision === 'NEEDS_HUMAN'
          ? 'escalated'
          : 'passed',
    summary: evaluationResult.summary,
    details: {
      decision: evaluationResult.decision,
      ruleTrace: evaluationResult.ruleTrace,
    },
    durationMs: Date.now() - t4,
  });

  // Stage 6: Execution or Human Approval Escalation
  const t5 = Date.now();
  let approvalId: string | undefined;
  let orderId: string | undefined;
  let captureId: string | undefined;
  let approvalUrl: string | undefined;

  if (evaluationResult.decision === 'BLOCK') {
    stages.push({
      stage: 'execution',
      name: 'Payment Execution',
      status: 'blocked',
      summary: `Transaction BLOCKED: ${evaluationResult.blockingReason || 'Policy hard constraint violated'}`,
      durationMs: Date.now() - t5,
    });

    return {
      requestId,
      userRequest,
      decision: 'BLOCK',
      stages,
      matchedListings,
      proposal,
      injectionResult,
      auditorVerdict,
      evaluationResult,
    };
  }

  if (evaluationResult.decision === 'NEEDS_HUMAN') {
    const summaryText = await generateHumanApprovalSummary(
      userRequest,
      proposal,
      evaluationResult,
      auditorVerdict
    );

    // Optionally pre-create PayPal order for instant approval
    try {
      const order = await paypalProvider.createOrder({
        amount: proposal.total,
        currency: 'USD',
        referenceId: `appr_ref_${requestId}`,
        description: `Allowance Order: ${proposal.items[0]?.title}`.slice(0, 127),
      });
      orderId = order.orderId;
      approvalUrl = order.approvalUrl;
    } catch {
      // Order creation can happen upon explicit human approval click
    }

    const appr = createApproval(proposal, evaluationResult, summaryText, orderId);
    approvalId = appr.id;

    stages.push({
      stage: 'execution',
      name: 'Payment Execution',
      status: 'escalated',
      summary: `Escalated for human approval. Request ID: ${approvalId}`,
      details: { approvalId, summary: summaryText, orderId, approvalUrl },
      durationMs: Date.now() - t5,
    });

    return {
      requestId,
      userRequest,
      decision: 'NEEDS_HUMAN',
      stages,
      matchedListings,
      proposal,
      injectionResult,
      auditorVerdict,
      evaluationResult,
      approvalId,
      orderId,
      approvalUrl,
    };
  }

  // AUTO_APPROVE -> Execute in PayPal Sandbox!
  try {
    const order = await paypalProvider.createOrder({
      amount: proposal.total,
      currency: 'USD',
      referenceId: `auto_ref_${requestId}`,
      description: `Allowance Auto-Approved: ${proposal.items[0]?.title}`.slice(0, 127),
      sandboxAutoPay: options?.autoCapturePayPal !== false,
    });

    orderId = order.orderId;
    approvalUrl = order.approvalUrl;
    captureId = order.captureId;

    saveOrderRecord({
      orderId: order.orderId,
      referenceId: `auto_ref_${requestId}`,
      amount: proposal.total,
      currency: 'USD',
      status: captureId ? 'COMPLETED' : order.status,
      captureId: captureId || undefined,
      proposal,
    });

    logAuditEvent(
      {
        id: `audit_pp_create_${requestId}`,
        timestamp: new Date().toISOString(),
        eventType: 'PAYPAL_ORDER_CREATED',
        summary: `PayPal Sandbox Order ${order.orderId} created for $${proposal.total.toFixed(2)}`,
        details: { orderId: order.orderId, status: order.status, approvalUrl, captureId },
        decision: 'AUTO_APPROVE',
        runId,
      },
      runId
    );

    // If already captured via direct sandboxAutoPay
    if (captureId) {
      if (options?.recordSpendInDb !== false) {
        recordSpend({
          id: `spend_${Date.now()}`,
          orderId: order.orderId,
          captureId,
          amount: proposal.total,
          category: proposal.category,
          timestamp: new Date().toISOString(),
          status: 'COMPLETED',
          proposalSummary: proposal.items[0]?.title,
        });
      }

      logAuditEvent(
        {
          id: `audit_pp_cap_${requestId}`,
          timestamp: new Date().toISOString(),
          eventType: 'PAYPAL_ORDER_CAPTURED',
          summary: `PayPal Sandbox Capture ${captureId} completed ($${proposal.total.toFixed(2)})`,
          details: { captureId, orderId: order.orderId },
          decision: 'AUTO_APPROVE',
          runId,
        },
        runId
      );
    } else if (options?.autoCapturePayPal !== false) {
      try {
        const capture = await paypalProvider.captureOrder({ orderId: order.orderId });
        captureId = capture.captureId;

        saveOrderRecord({
          orderId: order.orderId,
          referenceId: `auto_ref_${requestId}`,
          amount: proposal.total,
          currency: 'USD',
          status: capture.status,
          captureId: capture.captureId,
          proposal,
        });

        if (options?.recordSpendInDb !== false) {
          recordSpend({
            id: `spend_${Date.now()}`,
            orderId: order.orderId,
            captureId: capture.captureId,
            amount: proposal.total,
            category: proposal.category,
            timestamp: new Date().toISOString(),
            status: 'COMPLETED',
            proposalSummary: proposal.items[0]?.title,
          });
        }

        logAuditEvent(
          {
            id: `audit_pp_cap_${requestId}`,
            timestamp: new Date().toISOString(),
            eventType: 'PAYPAL_ORDER_CAPTURED',
            summary: `PayPal Sandbox Capture ${capture.captureId} completed ($${proposal.total.toFixed(2)})`,
            details: { captureId: capture.captureId, orderId: order.orderId },
            decision: 'AUTO_APPROVE',
            runId,
          },
          runId
        );
      } catch (capErr: any) {
        if (options?.recordSpendInDb !== false) {
          recordSpend({
            id: `spend_${Date.now()}`,
            orderId: order.orderId,
            amount: proposal.total,
            category: proposal.category,
            timestamp: new Date().toISOString(),
            status: 'PENDING',
            proposalSummary: `${proposal.items[0]?.title} (Awaiting Sandbox Buyer Approval)`,
          });
        }
      }
    }

    stages.push({
      stage: 'execution',
      name: 'Payment Execution',
      status: 'passed',
      summary: captureId
        ? `PAID in PayPal Sandbox! Capture ID: ${captureId} ($${proposal.total.toFixed(2)})`
        : `Order created in PayPal Sandbox: ${orderId} ($${proposal.total.toFixed(2)}) - Ready for buyer approval`,
      details: { orderId, captureId, approvalUrl },
      durationMs: Date.now() - t5,
    });

    return {
      requestId,
      userRequest,
      decision: 'AUTO_APPROVE',
      stages,
      matchedListings,
      proposal,
      injectionResult,
      auditorVerdict,
      evaluationResult,
      orderId,
      captureId,
      approvalUrl,
    };
  } catch (err: any) {
    stages.push({
      stage: 'execution',
      name: 'Payment Execution',
      status: 'blocked',
      summary: `PayPal Gateway Error: ${err.message}`,
      durationMs: Date.now() - t5,
    });

    logAuditEvent({
      id: `audit_pp_err_${requestId}`,
      timestamp: new Date().toISOString(),
      eventType: 'PAYPAL_ERROR',
      summary: `PayPal Error: ${err.message}`,
      details: { error: err.message },
      decision: 'BLOCK',
    });

    return {
      requestId,
      userRequest,
      decision: 'BLOCK',
      stages,
      matchedListings,
      proposal,
      injectionResult,
      auditorVerdict,
      evaluationResult,
      error: err.message,
    };
  }
}

