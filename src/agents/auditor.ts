import { z } from 'zod';
import { AuditorVerdict, Policy, PurchaseProposal, SpendRecord } from '../core/types';
import { ProductListing } from '../providers/products/types';
import { callGeminiStructured, STRONG_MODEL } from './gemini-client';

export const AuditorOutputSchema = z.object({
  verdict: z.enum(['approve', 'escalate', 'block']),
  reasons: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  anomalyTypes: z.array(z.string()).optional(),
});

const AUDITOR_SYSTEM_PROMPT = `
You are Warden's independent Adversarial Auditor Agent.
Your mission is to audit automated purchase proposals to protect the buyer from:
1. SPLIT ORDERS: Structuring transactions or splitting single bundles into multiple items/orders to evade the $50 auto-approval limit (e.g. splitting a $90 desk organizer into two $45 parts).
2. HIDDEN SUBSCRIPTIONS / RECURRING FEES: Fine-print terms converting a "free trial" or starter box into recurring charges (e.g. $19.99/month).
3. PRICE GOUGING / MARKET PRICE ANOMALIES: Items priced drastically above reasonable market value (e.g. 3x-4x overpriced basics, like $48 for a standard box of ballpoint pens).
4. REQUEST MISMATCH: Proposals that do not match the user's intended request.

IMPORTANT INVARIANTS:
- You do NOT see the shopper agent's subjective justification. You evaluate ONLY objective proposal data, raw listing text, policy limits, and recent transaction history.
- Be vigilant and adversarial. When in doubt, prefer 'escalate' (requires human review) over 'approve'.
- Return your judgment as structured JSON matching the requested schema.
`;

export async function auditProposal(params: {
  proposal: PurchaseProposal;
  rawListings: ProductListing[];
  policy: Policy;
  originalRequest: string;
  recentPurchases: SpendRecord[];
}): Promise<AuditorVerdict> {
  const isAiDisabled =
    process.env.DISABLE_AI_CHECKS === 'true' || process.env.DISABLE_AI_CHECKS === '1';

  // Deterministic checks even if AI is disabled
  const reasons: string[] = [];
  let deterministicVerdict: AuditorVerdict['verdict'] = 'approve';

  // Check 1: Hidden subscription in raw listing text
  const rawTextCombined = params.rawListings
    .map((l) => `${l.title} ${l.description} ${l.subscriptionDetails || ''}`)
    .join(' ')
    .toLowerCase();

  if (
    rawTextCombined.includes('/month') ||
    rawTextCombined.includes('recurring') ||
    rawTextCombined.includes('billed automatically') ||
    rawTextCombined.includes('subscription')
  ) {
    if (!params.policy.allowSubscriptions) {
      reasons.push('Hidden recurring subscription or fine-print billing detected in listing terms');
      deterministicVerdict = 'block';
    }
  }

  // Check 2: 3x-4x Market price anomaly check
  for (const item of params.proposal.items) {
    const rawListing = params.rawListings.find((l) => l.id === item.listingId);
    if (rawListing?.marketPriceEstimate && item.unitPrice >= rawListing.marketPriceEstimate * 3) {
      reasons.push(
        `Severe price inflation detected: unit price $${item.unitPrice.toFixed(2)} is ${(item.unitPrice / rawListing.marketPriceEstimate).toFixed(1)}x estimated market value of $${rawListing.marketPriceEstimate.toFixed(2)}`
      );
      deterministicVerdict = 'escalate';
    }
  }

  // Check 3: Split order detection (e.g. "Split Pack 1 of 2", "Module A", "Part 1 of 2")
  const splitKeywords = ['split pack', 'module a', 'part 1 of', 'part 2 of', 'split into'];
  const hasSplitSignature = splitKeywords.some((kw) => rawTextCombined.includes(kw));
  if (hasSplitSignature) {
    reasons.push(
      'Suspicious multi-part split order detected: listing appears to partition a bundled product to circumvent single-order limits'
    );
    if (deterministicVerdict !== 'block') {
      deterministicVerdict = 'escalate';
    }
  }

  if (isAiDisabled) {
    return {
      verdict: deterministicVerdict,
      reasons:
        reasons.length > 0
          ? reasons
          : ['Deterministic auditor passed (AI disabled via DISABLE_AI_CHECKS=true).'],
      confidence: 0.9,
    };
  }

  // Strip shopper reasoning from proposal to ensure independent evaluation
  const proposalWithoutShopperReasoning = {
    items: params.proposal.items,
    seller: params.proposal.seller,
    unitPrice: params.proposal.unitPrice,
    quantity: params.proposal.quantity,
    total: params.proposal.total,
    category: params.proposal.category,
    isSubscription: params.proposal.isSubscription,
  };

  const prompt = `
ORIGINAL USER REQUEST:
"${params.originalRequest}"

PURCHASE PROPOSAL (Awaiting Audit):
${JSON.stringify(proposalWithoutShopperReasoning, null, 2)}

RAW MERCHANT LISTINGS:
<merchant_listings>
${JSON.stringify(
  params.rawListings.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price,
    seller: l.seller,
    marketPriceEstimate: l.marketPriceEstimate,
    subscriptionDetails: l.subscriptionDetails,
  })),
  null,
  2
)}
</merchant_listings>

POLICY CONSTRAINTS:
- Auto-approve threshold: $${params.policy.autoApproveThreshold} (strictly < $50 auto-approves)
- Global monthly cap: $${params.policy.globalMonthlyCap}
- Allow subscriptions: ${params.policy.allowSubscriptions}

PAST 30-DAY PURCHASE HISTORY:
${JSON.stringify(params.recentPurchases.slice(0, 10), null, 2)}

Audit this proposal thoroughly for:
1. Split orders attempting to stay under the $50 limit.
2. Hidden subscriptions / free trials with fine-print billing.
3. Market price inflation (e.g. $48 for pens).
4. Request mismatch.

Return verdict: 'approve' | 'escalate' | 'block', list reasons, and confidence (0.0 to 1.0).
`;

  try {
    const aiVerdict = await callGeminiStructured({
      model: STRONG_MODEL,
      systemPrompt: AUDITOR_SYSTEM_PROMPT,
      prompt,
      schema: AuditorOutputSchema,
    });

    // Invariant: Combine deterministic findings with AI findings (tightest verdict wins)
    let finalVerdict: AuditorVerdict['verdict'] = aiVerdict.verdict;
    if (deterministicVerdict === 'block') {
      finalVerdict = 'block';
    } else if (deterministicVerdict === 'escalate' && finalVerdict === 'approve') {
      finalVerdict = 'escalate';
    }

    const mergedReasons = Array.from(new Set([...reasons, ...aiVerdict.reasons]));

    return {
      verdict: finalVerdict,
      reasons: mergedReasons.length > 0 ? mergedReasons : ['No compliance anomalies detected.'],
      confidence: aiVerdict.confidence,
    };
  } catch (err: any) {
    // Graceful fallback to deterministic checks if LLM call fails
    return {
      verdict: deterministicVerdict,
      reasons:
        reasons.length > 0
          ? reasons
          : [`Auditor model error: ${err.message}. Proceeding with deterministic safeguards.`],
      confidence: 0.85,
    };
  }
}

