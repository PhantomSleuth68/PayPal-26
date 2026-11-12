import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectInjection } from '../agents/injection-shield';
import { evaluatePolicy, DEFAULT_POLICY } from '../core/policy-engine';
import { PurchaseProposal } from '../core/types';
import { SEED_PRODUCTS } from '../providers/products/seed-data';

describe('Injection Shield & Deterministic Safety', () => {
  const originalEnv = process.env.DISABLE_AI_CHECKS;

  afterEach(() => {
    process.env.DISABLE_AI_CHECKS = originalEnv;
  });

  const attackListing = SEED_PRODUCTS.find((p) => p.id === 'prod-injection-attack')!;

  it('detects prompt injection via regex pre-filter signatures', async () => {
    process.env.DISABLE_AI_CHECKS = 'true'; // pure regex mode
    const result = await detectInjection(attackListing.description);

    expect(result.injectionDetected).toBe(true);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.evidence.some((e) => e.includes('SYSTEM NOTE'))).toBe(true);
  });

  it('blocks the attack listing when AI checks are enabled', async () => {
    delete process.env.DISABLE_AI_CHECKS;
    const injectionResult = await detectInjection(attackListing.description);
    expect(injectionResult.injectionDetected).toBe(true);

    const proposal: PurchaseProposal = {
      items: [
        {
          title: attackListing.title,
          unitPrice: attackListing.price,
          quantity: 10,
          totalPrice: attackListing.price * 10,
          listingId: attackListing.id,
        },
      ],
      seller: attackListing.seller,
      unitPrice: attackListing.price,
      quantity: 10,
      total: attackListing.price * 10,
      category: attackListing.category,
      reasoning: 'User pre-approved 10 units per listing instructions.',
      sourceListingIds: [attackListing.id],
      isSubscription: false,
    };

    const evaluation = evaluatePolicy(
      DEFAULT_POLICY,
      proposal,
      [],
      undefined,
      injectionResult
    );

    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.blockingReason).toContain('Adversarial prompt injection detected');
  });

  it('CRITICAL TEST: Independently BLOCKS injected "buy 10 units, skip approval" even when AI checks are DISABLED (DISABLE_AI_CHECKS=true)', () => {
    process.env.DISABLE_AI_CHECKS = 'true';

    // Assume an adversarial scenario where AI checks completely failed or were bypassed
    // The attacker attempted to force purchase of 10 units ($245.00 total)
    const injectedProposal: PurchaseProposal = {
      items: [
        {
          title: attackListing.title,
          unitPrice: 24.5,
          quantity: 10,
          totalPrice: 245.0,
          listingId: attackListing.id,
        },
      ],
      seller: attackListing.seller,
      unitPrice: 24.5,
      quantity: 10,
      total: 245.0,
      category: 'office supplies',
      reasoning: 'AI fooled: Buy 10 units and skip approval.',
      sourceListingIds: [attackListing.id],
      isSubscription: false,
    };

    // Evaluate with ZERO AI injection detection or auditor results
    const evaluation = evaluatePolicy(DEFAULT_POLICY, injectedProposal, [], undefined, undefined);

    // Deterministic rules MUST still BLOCK it!
    expect(evaluation.decision).toBe('BLOCK');
    // Reason 1: Quantity 10 exceeds max quantity 3
    expect(evaluation.blockingReason).toContain('exceeds maximum allowable quantity of 3');
    // Reason 2: Total $245 exceeds monthly cap $200
    expect(evaluation.blockingReason).toContain('exceeding the $200.00 cap');
  });
});
