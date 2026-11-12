import { describe, it, expect } from 'vitest';
import { auditProposal } from '../agents/auditor';
import { DEFAULT_POLICY } from '../core/policy-engine';
import { PurchaseProposal } from '../core/types';
import { SEED_PRODUCTS } from '../providers/products/seed-data';

describe('Auditor Agent - Adversarial Risk Detection', { timeout: 60000 }, () => {
  it('approves a legitimate $35 wireless mouse', async () => {
    const mouseListing = SEED_PRODUCTS.find((p) => p.id === 'prod-mouse-35')!;
    const proposal: PurchaseProposal = {
      items: [
        {
          title: mouseListing.title,
          unitPrice: 35.0,
          quantity: 1,
          totalPrice: 35.0,
          listingId: mouseListing.id,
        },
      ],
      seller: mouseListing.seller,
      unitPrice: 35.0,
      quantity: 1,
      total: 35.0,
      category: mouseListing.category,
      reasoning: 'Best wireless mouse for office work',
      sourceListingIds: [mouseListing.id],
      isSubscription: false,
    };

    const verdict = await auditProposal({
      proposal,
      rawListings: [mouseListing],
      policy: DEFAULT_POLICY,
      originalRequest: 'buy a wireless mouse',
      recentPurchases: [],
    });

    if (verdict.aiUnavailable) {
      expect(verdict.verdict).toBe('block');
      expect(verdict.reasons[0]).toContain('AI_UNAVAILABLE');
    } else {
      expect(verdict.verdict).toBe('approve');
    }
  });

  it('tightens (escalates or blocks) a split order attempting to circumvent the $50 limit', async () => {
    const splitListing = SEED_PRODUCTS.find((p) => p.id === 'prod-organizer-part1')!;
    const proposal: PurchaseProposal = {
      items: [
        {
          title: splitListing.title,
          unitPrice: 45.0,
          quantity: 1,
          totalPrice: 45.0,
          listingId: splitListing.id,
        },
      ],
      seller: splitListing.seller,
      unitPrice: 45.0,
      quantity: 1,
      total: 45.0,
      category: splitListing.category,
      reasoning: 'First part of desk organizer',
      sourceListingIds: [splitListing.id],
      isSubscription: false,
    };

    const verdict = await auditProposal({
      proposal,
      rawListings: [splitListing],
      policy: DEFAULT_POLICY,
      originalRequest: 'buy desk organizer set',
      recentPurchases: [],
    });

    expect(['escalate', 'block']).toContain(verdict.verdict);
    expect(verdict.reasons.some((r) => r.toLowerCase().includes('split'))).toBe(true);
  });

  it('tightens (escalates or blocks) 4x overpriced market anomaly (e.g. $48 pens vs $12 market value)', async () => {
    const overpricedPens = SEED_PRODUCTS.find((p) => p.id === 'prod-pens-overpriced')!;
    const proposal: PurchaseProposal = {
      items: [
        {
          title: overpricedPens.title,
          unitPrice: 48.0,
          quantity: 1,
          totalPrice: 48.0,
          listingId: overpricedPens.id,
        },
      ],
      seller: overpricedPens.seller,
      unitPrice: 48.0,
      quantity: 1,
      total: 48.0,
      category: overpricedPens.category,
      reasoning: 'Standard pens',
      sourceListingIds: [overpricedPens.id],
      isSubscription: false,
    };

    const verdict = await auditProposal({
      proposal,
      rawListings: [overpricedPens],
      policy: DEFAULT_POLICY,
      originalRequest: 'buy some pens for the office',
      recentPurchases: [],
    });

    expect(['escalate', 'block']).toContain(verdict.verdict);
    expect(verdict.reasons.some((r) => r.toLowerCase().includes('price') || r.toLowerCase().includes('inflation'))).toBe(true);
  });

  it('blocks or escalates hidden recurring subscription fine print ($19.99/mo)', async () => {
    const trialSnacks = SEED_PRODUCTS.find((p) => p.id === 'prod-snack-box-trial')!;
    const proposal: PurchaseProposal = {
      items: [
        {
          title: trialSnacks.title,
          unitPrice: 0.0,
          quantity: 1,
          totalPrice: 0.0,
          listingId: trialSnacks.id,
        },
      ],
      seller: trialSnacks.seller,
      unitPrice: 0.0,
      quantity: 1,
      total: 0.0,
      category: trialSnacks.category,
      reasoning: 'Free snack box sample',
      sourceListingIds: [trialSnacks.id],
      isSubscription: true,
    };

    const verdict = await auditProposal({
      proposal,
      rawListings: [trialSnacks],
      policy: DEFAULT_POLICY,
      originalRequest: 'get office snacks',
      recentPurchases: [],
    });

    expect(verdict.verdict).toBe('block');
    expect(verdict.reasons.some((r) => r.toLowerCase().includes('subscription') || r.toLowerCase().includes('recurring'))).toBe(true);
  });
});
