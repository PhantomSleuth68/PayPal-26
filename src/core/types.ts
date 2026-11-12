import { z } from 'zod';

export type Decision = 'AUTO_APPROVE' | 'NEEDS_HUMAN' | 'BLOCK';

export interface RuleTrace {
  ruleId: string;
  name: string;
  passed: boolean;
  verdict: Decision;
  reason: string;
  details?: Record<string, unknown>;
}

export interface AuditorVerdict {
  verdict: 'approve' | 'escalate' | 'block';
  reasons: string[];
  confidence: number;
}

export interface InjectionResult {
  injectionDetected: boolean;
  evidence: string[];
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const PurchaseItemSchema = z.object({
  title: z.string(),
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  totalPrice: z.number().positive(),
  listingId: z.string(),
});
export type PurchaseItem = z.infer<typeof PurchaseItemSchema>;

export const SellerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isVerified: z.boolean(),
  rating: z.number().min(0).max(5),
  hasReturnPolicy: z.boolean(),
});
export type Seller = z.infer<typeof SellerSchema>;

export const PurchaseProposalSchema = z.object({
  id: z.string().optional(),
  items: z.array(PurchaseItemSchema).min(1),
  seller: SellerSchema,
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  total: z.number().positive(),
  category: z.string(),
  reasoning: z.string(),
  sourceListingIds: z.array(z.string()),
  isSubscription: z.boolean().default(false),
});
export type PurchaseProposal = z.infer<typeof PurchaseProposalSchema>;

export interface Policy {
  id: string;
  name: string;
  allowedCategories: string[];
  globalMonthlyCap: number;
  categoryCaps?: Record<string, number>;
  autoApproveThreshold: number; // Strictly less than this amount is auto-approved (e.g. < 50.00)
  maxQuantityPerOrder: number;
  requireVerifiedSeller: boolean;
  minSellerRating?: number;
  requireReturnPolicy: boolean;
  allowSubscriptions: boolean;
  blockedKeywords: string[];
  blockedSellers: string[];
  killSwitchActive: boolean;
}

export interface SpendRecord {
  id: string;
  orderId?: string;
  captureId?: string;
  amount: number;
  category: string;
  timestamp: string;
  status: 'COMPLETED' | 'PENDING' | 'REJECTED';
  proposalSummary?: string;
}

export type AuditEventType =
  | 'SEARCH'
  | 'PROPOSAL'
  | 'INJECTION_CHECK'
  | 'AUDITOR_VERDICT'
  | 'POLICY_EVALUATION'
  | 'HUMAN_APPROVAL'
  | 'PAYPAL_ORDER_CREATED'
  | 'PAYPAL_ORDER_CAPTURED'
  | 'PAYPAL_ERROR'
  | 'KILL_SWITCH_TOGGLED'
  | 'APPROVAL_REJECTED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  summary: string;
  details?: Record<string, unknown>;
  ruleTrace?: RuleTrace[];
  decision?: Decision;
  runId?: string;
}

export interface PolicyEvaluationResult {
  decision: Decision;
  ruleTrace: RuleTrace[];
  summary: string;
  requiresHumanReason?: string;
  blockingReason?: string;
}

