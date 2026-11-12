import {
  Decision,
  Policy,
  PolicyEvaluationResult,
  PurchaseProposal,
  RuleTrace,
  SpendRecord,
  AuditorVerdict,
  InjectionResult,
} from './types';

export const DEFAULT_POLICY: Policy = {
  id: 'policy-default-office',
  name: 'Default Office Supplies Policy',
  allowedCategories: ['office supplies'],
  globalMonthlyCap: 200.0,
  categoryCaps: {
    'office supplies': 200.0,
  },
  autoApproveThreshold: 50.0, // Strictly under $50 is auto-approved; >= $50 requires human
  maxQuantityPerOrder: 3,
  requireVerifiedSeller: true,
  minSellerRating: 4.0,
  requireReturnPolicy: true,
  allowSubscriptions: false,
  blockedKeywords: ['cryptocurrency', 'gift card', 'cash', 'gambling', 'lottery'],
  blockedSellers: ['seller-fraud-corp', 'scam-depot'],
  killSwitchActive: false,
  duplicateWindowDays: 30, // Default 30-day duplicate detection window
  duplicateRapidBlockMinutes: 10, // Default 10-minute rapid duplicate block threshold
};

export const DECISION_RANKS: Record<Decision, number> = {
  AUTO_APPROVE: 0,
  NEEDS_HUMAN: 1,
  BLOCK: 2,
};

export function stricterDecision(a: Decision, b: Decision): Decision {
  return DECISION_RANKS[a] >= DECISION_RANKS[b] ? a : b;
}

/**
 * Deterministic policy evaluator (pure code, zero LLM reliance).
 * Evaluates a purchase proposal against hard policy rules, past spend,
 * and incorporates auditor and injection detector results.
 *
 * Invariant: The auditor and detector can only TIGHTEN a decision
 * (AUTO_APPROVE -> NEEDS_HUMAN -> BLOCK), never loosen it.
 */
export function evaluatePolicy(
  policy: Policy,
  proposal: PurchaseProposal,
  spendHistory: SpendRecord[] = [],
  auditorVerdict?: AuditorVerdict,
  injectionResult?: InjectionResult
): PolicyEvaluationResult {
  const ruleTrace: RuleTrace[] = [];
  let decision: Decision = 'AUTO_APPROVE';

  // 1. Emergency Kill Switch Check
  if (policy.killSwitchActive) {
    const trace: RuleTrace = {
      ruleId: 'KILL_SWITCH_ACTIVE',
      name: 'Global Emergency Kill Switch',
      passed: false,
      verdict: 'BLOCK',
      reason: 'Agent permissions revoked via emergency kill switch. All purchases blocked.',
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'KILL_SWITCH_INACTIVE',
      name: 'Global Emergency Kill Switch',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: 'Emergency kill switch is disengaged.',
    });
  }

  // 2. Prompt Injection Detection Result
  if (injectionResult && injectionResult.injectionDetected) {
    const trace: RuleTrace = {
      ruleId: 'PROMPT_INJECTION_DETECTED',
      name: 'Injection Shield Check',
      passed: false,
      verdict: 'BLOCK',
      reason: `Adversarial prompt injection detected: ${injectionResult.evidence.join('; ')}`,
      details: { evidence: injectionResult.evidence, riskLevel: injectionResult.riskLevel },
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'INJECTION_SHIELD_PASSED',
      name: 'Injection Shield Check',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: 'No prompt injection signatures detected.',
    });
  }

  // 3. Subscription & Recurring Billing Ban
  if (!policy.allowSubscriptions && proposal.isSubscription) {
    const trace: RuleTrace = {
      ruleId: 'SUBSCRIPTION_PROHIBITED',
      name: 'Subscription Ban',
      passed: false,
      verdict: 'BLOCK',
      reason: 'Listing is a subscription or contains recurring billing, which is strictly prohibited.',
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'SUBSCRIPTION_ALLOWED_OR_ONE_TIME',
      name: 'Subscription Ban',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: 'One-time purchase; no subscription detected.',
    });
  }

  // 4. Blocked Sellers Check
  const sellerId = proposal.seller.id.toLowerCase();
  const sellerName = proposal.seller.name.toLowerCase();
  const isSellerBlocked = policy.blockedSellers.some(
    (b) => b.toLowerCase() === sellerId || b.toLowerCase() === sellerName
  );

  if (isSellerBlocked) {
    const trace: RuleTrace = {
      ruleId: 'SELLER_BLOCKED',
      name: 'Seller Blacklist',
      passed: false,
      verdict: 'BLOCK',
      reason: `Seller "${proposal.seller.name}" is on the prohibited sellers blacklist.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'SELLER_NOT_BLOCKED',
      name: 'Seller Blacklist',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Seller "${proposal.seller.name}" is not blacklisted.`,
    });
  }

  // 5. Seller Verification Requirement
  if (policy.requireVerifiedSeller && !proposal.seller.isVerified) {
    const trace: RuleTrace = {
      ruleId: 'SELLER_UNVERIFIED',
      name: 'Verified Seller Check',
      passed: false,
      verdict: 'BLOCK',
      reason: `Seller "${proposal.seller.name}" is not verified. Policy requires verified sellers only.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'SELLER_VERIFIED_PASSED',
      name: 'Verified Seller Check',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Seller "${proposal.seller.name}" is verified.`,
    });
  }

  // 6. Minimum Seller Rating Requirement
  if (policy.minSellerRating !== undefined && proposal.seller.rating < policy.minSellerRating) {
    const trace: RuleTrace = {
      ruleId: 'SELLER_RATING_TOO_LOW',
      name: 'Minimum Seller Rating',
      passed: false,
      verdict: 'BLOCK',
      reason: `Seller rating of ${proposal.seller.rating} is below required minimum of ${policy.minSellerRating}.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'SELLER_RATING_PASSED',
      name: 'Minimum Seller Rating',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Seller rating (${proposal.seller.rating}) meets minimum threshold (${policy.minSellerRating ?? 'none'}).`,
    });
  }

  // 7. Return Policy Requirement
  if (policy.requireReturnPolicy && !proposal.seller.hasReturnPolicy) {
    const trace: RuleTrace = {
      ruleId: 'NO_RETURN_POLICY',
      name: 'Return Policy Requirement',
      passed: false,
      verdict: 'BLOCK',
      reason: `Seller "${proposal.seller.name}" does not offer a return policy.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'RETURN_POLICY_PASSED',
      name: 'Return Policy Requirement',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: 'Seller offers an eligible return policy.',
    });
  }

  // 8. Blocked Keywords Check
  const searchableText = [
    ...proposal.items.map((i) => i.title),
    proposal.reasoning,
    proposal.category,
  ]
    .join(' ')
    .toLowerCase();

  const matchedKeyword = policy.blockedKeywords.find((kw) =>
    searchableText.includes(kw.toLowerCase())
  );

  if (matchedKeyword) {
    const trace: RuleTrace = {
      ruleId: 'BLOCKED_KEYWORD',
      name: 'Blocked Keywords',
      passed: false,
      verdict: 'BLOCK',
      reason: `Proposal contains prohibited keyword: "${matchedKeyword}".`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'BLOCKED_KEYWORD_PASSED',
      name: 'Blocked Keywords',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: 'No prohibited keywords detected in order.',
    });
  }

  // 9. Allowed Category Check
  const normalizedCategory = proposal.category.trim().toLowerCase();
  const isCategoryAllowed =
    policy.allowedCategories.length === 0 ||
    policy.allowedCategories.some((cat) => cat.trim().toLowerCase() === normalizedCategory);

  if (!isCategoryAllowed) {
    const trace: RuleTrace = {
      ruleId: 'CATEGORY_DISALLOWED',
      name: 'Allowed Categories',
      passed: false,
      verdict: 'BLOCK',
      reason: `Category "${proposal.category}" is not permitted. Allowed: ${policy.allowedCategories.join(', ')}.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'CATEGORY_ALLOWED_PASSED',
      name: 'Allowed Categories',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Category "${proposal.category}" is in the approved category list.`,
    });
  }

  // 10. Maximum Quantity Per Order
  const itemQuantities = proposal.items.map((i) => i.quantity);
  const maxSingleItemQty = Math.max(...itemQuantities, 0);
  const totalQuantity = proposal.quantity;

  if (totalQuantity > policy.maxQuantityPerOrder || maxSingleItemQty > policy.maxQuantityPerOrder) {
    const trace: RuleTrace = {
      ruleId: 'MAX_QUANTITY_EXCEEDED',
      name: 'Maximum Quantity Limit',
      passed: false,
      verdict: 'BLOCK',
      reason: `Requested quantity (${totalQuantity}) exceeds maximum allowable quantity of ${policy.maxQuantityPerOrder} per order.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'MAX_QUANTITY_PASSED',
      name: 'Maximum Quantity Limit',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Order quantity (${totalQuantity}) is within the allowable limit of ${policy.maxQuantityPerOrder}.`,
    });
  }

  // 11. Calculate Monthly Spend (completed records in current month/last 30 days)
  const completedSpend = spendHistory.filter((s) => s.status === 'COMPLETED');
  const currentMonthlySpend = completedSpend.reduce((acc, curr) => acc + curr.amount, 0);
  const projectedTotalSpend = currentMonthlySpend + proposal.total;

  if (projectedTotalSpend > policy.globalMonthlyCap) {
    const trace: RuleTrace = {
      ruleId: 'GLOBAL_MONTHLY_CAP_EXCEEDED',
      name: 'Global Monthly Spend Cap',
      passed: false,
      verdict: 'BLOCK',
      reason: `Purchase total of $${proposal.total.toFixed(2)} would bring monthly spend to $${projectedTotalSpend.toFixed(2)}, exceeding the $${policy.globalMonthlyCap.toFixed(2)} cap. (Current spend: $${currentMonthlySpend.toFixed(2)}).`,
      details: { currentMonthlySpend, projectedTotalSpend, cap: policy.globalMonthlyCap },
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'BLOCK');
  } else {
    ruleTrace.push({
      ruleId: 'GLOBAL_MONTHLY_CAP_PASSED',
      name: 'Global Monthly Spend Cap',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Projected spend ($${projectedTotalSpend.toFixed(2)}) is within the $${policy.globalMonthlyCap.toFixed(2)} monthly budget.`,
      details: { currentMonthlySpend, projectedTotalSpend, cap: policy.globalMonthlyCap },
    });
  }

  // 12. Category Cap Check
  if (policy.categoryCaps && policy.categoryCaps[proposal.category]) {
    const catCap = policy.categoryCaps[proposal.category];
    const categorySpend = completedSpend
      .filter((s) => s.category.trim().toLowerCase() === normalizedCategory)
      .reduce((acc, curr) => acc + curr.amount, 0);
    const projectedCategorySpend = categorySpend + proposal.total;

    if (projectedCategorySpend > catCap) {
      const trace: RuleTrace = {
        ruleId: 'CATEGORY_CAP_EXCEEDED',
        name: 'Category Monthly Spend Cap',
        passed: false,
        verdict: 'BLOCK',
        reason: `Category "${proposal.category}" spend would reach $${projectedCategorySpend.toFixed(2)}, exceeding limit of $${catCap.toFixed(2)}.`,
      };
      ruleTrace.push(trace);
      decision = stricterDecision(decision, 'BLOCK');
    }
  }

  // 13. Auto-Approval Threshold vs Human Escalation
  // "auto-approve under $50, ask above $50" -> Strictly less than $50.00 is auto-approved.
  // Exactly $50.00 or higher requires human approval.
  if (proposal.total >= policy.autoApproveThreshold) {
    const trace: RuleTrace = {
      ruleId: 'APPROVAL_THRESHOLD_EXCEEDED',
      name: 'Human Approval Threshold',
      passed: true, // Not blocked, but requires human
      verdict: 'NEEDS_HUMAN',
      reason: `Order total ($${proposal.total.toFixed(2)}) is at or above the auto-approval threshold of $${policy.autoApproveThreshold.toFixed(2)}. Human review required.`,
    };
    ruleTrace.push(trace);
    decision = stricterDecision(decision, 'NEEDS_HUMAN');
  } else {
    ruleTrace.push({
      ruleId: 'AUTO_APPROVE_THRESHOLD_MET',
      name: 'Human Approval Threshold',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `Order total ($${proposal.total.toFixed(2)}) is strictly under the $${policy.autoApproveThreshold.toFixed(2)} threshold.`,
    });
  }

  // 14. Duplicate Purchase Detection (Configurable window, default 30 days; repeat within window -> NEEDS_HUMAN; within 10 min -> BLOCK)
  const windowDays = policy.duplicateWindowDays ?? 30;
  const rapidBlockMinutes = policy.duplicateRapidBlockMinutes ?? 10;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const rapidBlockMs = rapidBlockMinutes * 60 * 1000;
  const evalTimestamp = Date.now();

  let matchedDuplicate: SpendRecord | null = null;
  let duplicateDiffMs = 0;
  let duplicateItemName = '';

  for (const item of proposal.items) {
    const itemNormTitle = item.title.trim().toLowerCase();
    const candidate = completedSpend.find((s) => {
      const sTime = new Date(s.timestamp).getTime();
      const diff = evalTimestamp - sTime;
      if (diff < 0 || diff > windowMs) return false;

      if (s.listingId && item.listingId && s.listingId === item.listingId) {
        return true;
      }
      if (s.itemTitle && s.itemTitle.trim().toLowerCase() === itemNormTitle) {
        return true;
      }
      if (s.proposalSummary) {
        const sumNorm = s.proposalSummary.trim().toLowerCase();
        return sumNorm.includes(itemNormTitle) || itemNormTitle.includes(sumNorm);
      }
      return false;
    });

    if (candidate) {
      matchedDuplicate = candidate;
      duplicateDiffMs = evalTimestamp - new Date(candidate.timestamp).getTime();
      duplicateItemName = item.title;
      break;
    }
  }

  if (matchedDuplicate) {
    if (duplicateDiffMs <= rapidBlockMs) {
      const diffMinDisplay = Math.max(0, Math.round(duplicateDiffMs / 60000));
      const trace: RuleTrace = {
        ruleId: 'DUPLICATE_PURCHASE_RAPID_BLOCK',
        name: 'Rapid Duplicate Purchase Prevention',
        passed: false,
        verdict: 'BLOCK',
        reason: `Duplicate purchase of identical item ("${duplicateItemName}") attempted within ${diffMinDisplay} minute(s) (rapid block threshold: ${rapidBlockMinutes} minutes). Blocked as potential replay or runaway loop.`,
        details: { duplicateItemName, diffMinutes: duplicateDiffMs / 60000, rapidBlockMinutes },
      };
      ruleTrace.push(trace);
      decision = stricterDecision(decision, 'BLOCK');
    } else {
      const daysAgo = (duplicateDiffMs / (1000 * 60 * 60 * 24)).toFixed(1);
      const trace: RuleTrace = {
        ruleId: 'DUPLICATE_PURCHASE_WINDOW_ESCALATION',
        name: 'Duplicate Purchase Window Check',
        passed: true,
        verdict: 'NEEDS_HUMAN',
        reason: `Repeat purchase of identical item ("${duplicateItemName}") within the ${windowDays}-day policy window (purchased ${daysAgo} days ago). Escalated for human review.`,
        details: { duplicateItemName, daysAgo, windowDays },
      };
      ruleTrace.push(trace);
      decision = stricterDecision(decision, 'NEEDS_HUMAN');
    }
  } else {
    ruleTrace.push({
      ruleId: 'DUPLICATE_CHECK_PASSED',
      name: 'Duplicate Purchase Window Check',
      passed: true,
      verdict: 'AUTO_APPROVE',
      reason: `No duplicate purchases of identical items found within the ${windowDays}-day policy window.`,
    });
  }

  // 15. Auditor Verdict Integration (Can only tighten)
  if (auditorVerdict) {
    if (auditorVerdict.verdict === 'block') {
      const trace: RuleTrace = {
        ruleId: 'AUDITOR_BLOCKED',
        name: 'Independent Auditor Agent',
        passed: false,
        verdict: 'BLOCK',
        reason: `Auditor agent blocked purchase: ${auditorVerdict.reasons.join('; ')}`,
        details: { confidence: auditorVerdict.confidence, reasons: auditorVerdict.reasons },
      };
      ruleTrace.push(trace);
      decision = stricterDecision(decision, 'BLOCK');
    } else if (auditorVerdict.verdict === 'escalate') {
      const trace: RuleTrace = {
        ruleId: 'AUDITOR_ESCALATED',
        name: 'Independent Auditor Agent',
        passed: true,
        verdict: 'NEEDS_HUMAN',
        reason: `Auditor agent escalated for human review: ${auditorVerdict.reasons.join('; ')}`,
        details: { confidence: auditorVerdict.confidence, reasons: auditorVerdict.reasons },
      };
      ruleTrace.push(trace);
      decision = stricterDecision(decision, 'NEEDS_HUMAN');
    } else {
      ruleTrace.push({
        ruleId: 'AUDITOR_APPROVED',
        name: 'Independent Auditor Agent',
        passed: true,
        verdict: 'AUTO_APPROVE',
        reason: 'Auditor verified purchase proposal without concerns.',
      });
    }
  }

  // Summaries
  const blockingTraces = ruleTrace.filter((t) => t.verdict === 'BLOCK');
  const humanTraces = ruleTrace.filter((t) => t.verdict === 'NEEDS_HUMAN');

  const blockingReason = blockingTraces.map((t) => t.reason).join(' | ');
  const requiresHumanReason = humanTraces.map((t) => t.reason).join(' | ');

  let summary = 'Purchase is approved for automatic execution.';
  if (decision === 'BLOCK') {
    summary = `Purchase BLOCKED by policy: ${blockingReason}`;
  } else if (decision === 'NEEDS_HUMAN') {
    summary = `Purchase requires human approval: ${requiresHumanReason}`;
  }

  return {
    decision,
    ruleTrace,
    summary,
    requiresHumanReason: requiresHumanReason || undefined,
    blockingReason: blockingReason || undefined,
  };
}

