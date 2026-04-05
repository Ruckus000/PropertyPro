import { describe, expect, it } from 'vitest';
import {
  computeSnapshot,
  runSanityChecks,
  computeMrrDeltaPct,
  type CommunityRow,
  type PriceRow,
} from '@/lib/services/revenue-snapshot-service';

const PRICES: PriceRow[] = [
  { planId: 'plan_1', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 10000 },
];

function mk(over: Partial<CommunityRow>): CommunityRow {
  return {
    id: 1,
    subscriptionStatus: 'active',
    subscriptionPlan: 'plan_1',
    communityType: 'condo_718',
    billingGroupId: null,
    deletedAt: null,
    isDemo: false,
    ...over,
  };
}

describe('chaos: missing stripe_prices row', () => {
  it('skips community with plan_999, snapshot still completes', () => {
    const r = computeSnapshot({
      communities: [mk({ subscriptionPlan: 'plan_999' }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.communitiesSkipped).toBe(1);
    expect(r.mrrCents).toBe(10000); // second community still counted
    expect(r.skipReasons.some((s) => s.communityId === 1)).toBe(true);
  });
});

describe('chaos: unknown subscription_status', () => {
  it('throws loudly (silent skip is wrong)', () => {
    expect(() =>
      computeSnapshot({
        communities: [mk({ subscriptionStatus: 'paused' })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      }),
    ).toThrow(/Unknown subscription_status/);
  });
});

describe('chaos: deleted community with active status', () => {
  it('excludes from MRR (invariant: deleted_at implies not counted)', () => {
    const r = computeSnapshot({
      communities: [mk({ id: 1, deletedAt: new Date() }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000); // only community 2
  });
});

describe('chaos: MRR drop > 20%', () => {
  it('passes sanity check but computes large negative delta_pct', () => {
    const delta = computeMrrDeltaPct(7000, 10000);
    expect(delta).toBe(-30);
    // Sanity check passes; the caller is expected to log a warning at |delta| > 20
  });
});

describe('chaos: MRR 10x jump', () => {
  it('sanity check rejects it', () => {
    const r = runSanityChecks({
      computed: {
        mrrCents: 100_001,
        potentialMrrCents: 100_001,
        activeSubscriptions: 0,
        trialingSubscriptions: 0,
        pastDueSubscriptions: 0,
        byPlan: {},
        byCommunityType: {},
        volumeDiscountSavingsCents: 0,
        freeAccessCostCents: 0,
        pricesVersion: 'x',
        communitiesSkipped: 0,
        skipReasons: [],
      },
      priorMrrCents: 10_000,
    });
    expect(r.ok).toBe(false);
  });
});

describe('chaos: all churned statuses', () => {
  it('none contribute to MRR or counters', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      const r = computeSnapshot({
        communities: [mk({ subscriptionStatus: status })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      });
      expect(r.mrrCents).toBe(0);
      expect(r.potentialMrrCents).toBe(0);
      expect(r.activeSubscriptions).toBe(0);
      expect(r.trialingSubscriptions).toBe(0);
      expect(r.pastDueSubscriptions).toBe(0);
    }
  });
});

describe('chaos: null/empty subscription_plan', () => {
  it('community is skipped, snapshot continues', () => {
    const r = computeSnapshot({
      communities: [mk({ subscriptionPlan: null }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.communitiesSkipped).toBe(1);
    expect(r.mrrCents).toBe(10000);
  });
});
