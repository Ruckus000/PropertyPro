import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeSnapshot,
  hashPrices,
  runSanityChecks,
  computeMrrDeltaPct,
  type CommunityRow,
  type PriceRow,
  type BillingGroupRow,
  type AccessPlanRow,
} from '@/lib/services/revenue-snapshot-service';

const PRICES: PriceRow[] = [
  { planId: 'plan_1', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 10000 },
  { planId: 'plan_1', communityType: 'hoa_720', billingInterval: 'month', unitAmountCents: 8000 },
  { planId: 'plan_2', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 20000 },
];

function makeCommunity(partial: Partial<CommunityRow>): CommunityRow {
  return {
    id: 1,
    subscriptionStatus: 'active',
    subscriptionPlan: 'plan_1',
    communityType: 'condo_718',
    billingGroupId: null,
    deletedAt: null,
    isDemo: false,
    ...partial,
  };
}

describe('computeSnapshot — basic', () => {
  it('computes mrr_cents from a single active community', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000);
    expect(r.potentialMrrCents).toBe(10000);
    expect(r.activeSubscriptions).toBe(1);
  });

  it('trials count toward potential but not billable MRR', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionStatus: 'trialing' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.potentialMrrCents).toBe(10000);
    expect(r.trialingSubscriptions).toBe(1);
  });

  it('past_due counts toward billable MRR', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionStatus: 'past_due' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000);
    expect(r.pastDueSubscriptions).toBe(1);
  });

  it('churned statuses are excluded from all MRR buckets', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      const r = computeSnapshot({
        communities: [makeCommunity({ id: 1, subscriptionStatus: status })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      });
      expect(r.mrrCents).toBe(0);
      expect(r.potentialMrrCents).toBe(0);
    }
  });

  it('throws loud error on unknown status', () => {
    expect(() =>
      computeSnapshot({
        communities: [makeCommunity({ subscriptionStatus: 'paused' })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      }),
    ).toThrow(/Unknown subscription_status/);
  });

  it('demo and soft-deleted communities are excluded', () => {
    const r = computeSnapshot({
      communities: [
        makeCommunity({ id: 1, isDemo: true }),
        makeCommunity({ id: 2, deletedAt: new Date() }),
      ],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.activeSubscriptions).toBe(0);
  });

  it('missing stripe_prices row skips community, does not crash', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionPlan: 'plan_999' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.communitiesSkipped).toBe(1);
    expect(r.skipReasons[0].reason).toContain('no_price_for_plan_999');
  });
});

describe('computeSnapshot — volume discounts', () => {
  it('applies tier_10 discount and records savings', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, billingGroupId: 1 })],
      prices: PRICES,
      billingGroups: [{ id: 1, volumeTier: 'tier_10', activeCommunityCount: 10 }],
      accessPlans: [],
    });
    // 10000 * 10% = 1000 discount => charged 9000
    expect(r.mrrCents).toBe(9000);
    expect(r.volumeDiscountSavingsCents).toBe(1000);
  });
});

describe('computeSnapshot — invariants (property-based)', () => {
  const communityArb = fc.record({
    id: fc.integer({ min: 1, max: 1000000 }),
    subscriptionStatus: fc.constantFrom(
      'active',
      'trialing',
      'past_due',
      'canceled',
      'expired',
      'unpaid',
      'incomplete_expired',
    ),
    subscriptionPlan: fc.constantFrom('plan_1', 'plan_2'),
    communityType: fc.constantFrom('condo_718', 'hoa_720'),
    billingGroupId: fc.constantFrom(null, 1),
    deletedAt: fc.constant(null),
    isDemo: fc.boolean(),
  });

  it('sum of by_plan.mrrCents equals mrr_cents', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [{ id: 1, volumeTier: 'none', activeCommunityCount: 0 }],
          accessPlans: [],
        });
        const sumByPlan = Object.values(r.byPlan).reduce((s, v) => s + v.mrrCents, 0);
        expect(sumByPlan).toBe(r.mrrCents);
      }),
    );
  });

  it('potential_mrr >= mrr_cents always', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        expect(r.potentialMrrCents).toBeGreaterThanOrEqual(r.mrrCents);
      }),
    );
  });

  it('mrr_cents is never negative', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        expect(r.mrrCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('active + trialing + past_due counts match status distribution', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        const live = communities.filter((c) => !c.isDemo && !c.deletedAt);
        const a = live.filter((c) => c.subscriptionStatus === 'active').length;
        const t = live.filter((c) => c.subscriptionStatus === 'trialing').length;
        const p = live.filter((c) => c.subscriptionStatus === 'past_due').length;
        expect(r.activeSubscriptions).toBe(a);
        expect(r.trialingSubscriptions).toBe(t);
        expect(r.pastDueSubscriptions).toBe(p);
      }),
    );
  });
});

describe('hashPrices', () => {
  it('produces the same hash for re-ordered input', () => {
    const reordered = [...PRICES].reverse();
    expect(hashPrices(PRICES)).toBe(hashPrices(reordered));
  });

  it('produces a different hash when an amount changes', () => {
    const h1 = hashPrices(PRICES);
    const h2 = hashPrices([{ ...PRICES[0], unitAmountCents: 99999 }, ...PRICES.slice(1)]);
    expect(h1).not.toBe(h2);
  });
});

describe('runSanityChecks', () => {
  const base = {
    mrrCents: 0,
    potentialMrrCents: 0,
    activeSubscriptions: 0,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    byPlan: {},
    byCommunityType: {},
    volumeDiscountSavingsCents: 0,
    freeAccessCostCents: 0,
    pricesVersion: 'abc',
    communitiesSkipped: 0,
    skipReasons: [],
  };

  it('passes when mrr is 0 and no prior', () => {
    const r = runSanityChecks({ computed: base, priorMrrCents: null });
    expect(r.ok).toBe(true);
  });

  it('fails when mrr is negative', () => {
    const r = runSanityChecks({ computed: { ...base, mrrCents: -1 }, priorMrrCents: null });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/negative/);
  });

  it('fails when mrr > 10x prior', () => {
    const r = runSanityChecks({
      computed: { ...base, mrrCents: 100001, potentialMrrCents: 100001 },
      priorMrrCents: 10000,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/10x/);
  });

  it('fails when potential < mrr (impossible state)', () => {
    const r = runSanityChecks({
      computed: { ...base, mrrCents: 500, potentialMrrCents: 100 },
      priorMrrCents: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/potential_mrr_cents.*<.*mrr_cents/);
  });
});

describe('computeMrrDeltaPct', () => {
  it('returns null when prior is null or zero', () => {
    expect(computeMrrDeltaPct(1000, null)).toBeNull();
    expect(computeMrrDeltaPct(1000, 0)).toBeNull();
  });

  it('computes positive delta', () => {
    expect(computeMrrDeltaPct(1100, 1000)).toBe(10);
  });

  it('computes negative delta', () => {
    expect(computeMrrDeltaPct(900, 1000)).toBe(-10);
  });
});
