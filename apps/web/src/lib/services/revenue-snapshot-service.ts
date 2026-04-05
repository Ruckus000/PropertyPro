/**
 * Pure computation of a revenue snapshot.
 *
 * Deliberately has zero DB/Stripe dependencies — caller passes in all inputs.
 * This makes the function unit-testable without a database and makes the
 * invariants easier to verify.
 */
import { createHash } from 'node:crypto';
import {
  BILLABLE_STATUSES,
  TRIAL_STATUSES,
  isKnownStatus,
} from '@propertypro/shared';

export interface PriceRow {
  planId: string;
  communityType: string;
  billingInterval: string;
  unitAmountCents: number;
}

export interface CommunityRow {
  id: number;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  communityType: string;
  billingGroupId: number | null;
  deletedAt: Date | null;
  isDemo: boolean;
}

export interface BillingGroupRow {
  id: number;
  volumeTier: string; // 'none' | 'tier_10' | 'tier_15' | 'tier_20'
  activeCommunityCount: number;
}

export interface AccessPlanRow {
  communityId: number;
  status: 'active' | 'in_grace';
}

export interface SnapshotComputation {
  mrrCents: number;
  potentialMrrCents: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  byPlan: Record<string, { count: number; mrrCents: number }>;
  byCommunityType: Record<string, { count: number; mrrCents: number }>;
  volumeDiscountSavingsCents: number;
  freeAccessCostCents: number;
  pricesVersion: string;
  communitiesSkipped: number;
  skipReasons: Array<{ communityId: number; reason: string }>;
}

const VOLUME_TIER_DISCOUNT_PCT: Record<string, number> = {
  none: 0,
  tier_10: 10,
  tier_15: 15,
  tier_20: 20,
};

export function hashPrices(prices: PriceRow[]): string {
  const sorted = [...prices].sort((a, b) => {
    const k = `${a.planId}|${a.communityType}|${a.billingInterval}`;
    const l = `${b.planId}|${b.communityType}|${b.billingInterval}`;
    return k.localeCompare(l);
  });
  const json = JSON.stringify(
    sorted.map((p) => ({
      p: p.planId,
      t: p.communityType,
      i: p.billingInterval,
      a: p.unitAmountCents,
    })),
  );
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function findPrice(
  prices: PriceRow[],
  planId: string,
  communityType: string,
): PriceRow | undefined {
  return prices.find(
    (p) =>
      p.planId === planId && p.communityType === communityType && p.billingInterval === 'month',
  );
}

export function computeSnapshot(input: {
  communities: CommunityRow[];
  prices: PriceRow[];
  billingGroups: BillingGroupRow[];
  accessPlans: AccessPlanRow[];
}): SnapshotComputation {
  const { communities, prices, billingGroups, accessPlans } = input;

  const result: SnapshotComputation = {
    mrrCents: 0,
    potentialMrrCents: 0,
    activeSubscriptions: 0,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    byPlan: {},
    byCommunityType: {},
    volumeDiscountSavingsCents: 0,
    freeAccessCostCents: 0,
    pricesVersion: hashPrices(prices),
    communitiesSkipped: 0,
    skipReasons: [],
  };

  const billingGroupById = new Map(billingGroups.map((g) => [g.id, g]));

  for (const c of communities) {
    // Hard filter: skip demo and soft-deleted
    if (c.isDemo || c.deletedAt) continue;
    if (!c.subscriptionStatus || !c.subscriptionPlan) {
      result.communitiesSkipped += 1;
      result.skipReasons.push({
        communityId: c.id,
        reason: 'missing_status_or_plan',
      });
      continue;
    }

    // Loud error on unknown status
    if (!isKnownStatus(c.subscriptionStatus)) {
      throw new Error(
        `Unknown subscription_status "${c.subscriptionStatus}" on community ${c.id}`,
      );
    }

    // Status counters (for all known non-churned)
    if (c.subscriptionStatus === 'active') result.activeSubscriptions += 1;
    if (c.subscriptionStatus === 'trialing') result.trialingSubscriptions += 1;
    if (c.subscriptionStatus === 'past_due') result.pastDueSubscriptions += 1;

    // Only billable + trial statuses contribute to revenue
    const isBillable = (BILLABLE_STATUSES as readonly string[]).includes(c.subscriptionStatus);
    const isTrial = (TRIAL_STATUSES as readonly string[]).includes(c.subscriptionStatus);
    if (!isBillable && !isTrial) continue;

    const price = findPrice(prices, c.subscriptionPlan, c.communityType);
    if (!price) {
      result.communitiesSkipped += 1;
      result.skipReasons.push({
        communityId: c.id,
        reason: `no_price_for_${c.subscriptionPlan}_${c.communityType}`,
      });
      continue;
    }

    const listAmount = price.unitAmountCents;

    // Apply volume discount if billing group present
    let chargedAmount = listAmount;
    if (c.billingGroupId) {
      const group = billingGroupById.get(c.billingGroupId);
      if (group) {
        const pct = VOLUME_TIER_DISCOUNT_PCT[group.volumeTier] ?? 0;
        const discount = Math.round(listAmount * (pct / 100));
        chargedAmount = listAmount - discount;
        result.volumeDiscountSavingsCents += discount;
      }
    }

    if (isBillable) {
      result.mrrCents += chargedAmount;
      result.potentialMrrCents += chargedAmount;
    } else if (isTrial) {
      // Trials don't contribute to billable MRR; they count toward potential at list.
      result.potentialMrrCents += listAmount;
    }

    // By-plan rollup (count only billable + trial for MRR view)
    const planKey = c.subscriptionPlan;
    if (!result.byPlan[planKey]) result.byPlan[planKey] = { count: 0, mrrCents: 0 };
    result.byPlan[planKey].count += 1;
    if (isBillable) result.byPlan[planKey].mrrCents += chargedAmount;

    // By-community-type rollup
    const typeKey = c.communityType;
    if (!result.byCommunityType[typeKey])
      result.byCommunityType[typeKey] = { count: 0, mrrCents: 0 };
    result.byCommunityType[typeKey].count += 1;
    if (isBillable) result.byCommunityType[typeKey].mrrCents += chargedAmount;
  }

  // Free access cost: communities with an active or in_grace access plan
  // forgo their list-price MRR. Compute by looking up each such community's price.
  const accessCommunityIds = new Set(accessPlans.map((a) => a.communityId));
  const communityById = new Map(communities.map((c) => [c.id, c]));
  for (const id of accessCommunityIds) {
    const c = communityById.get(id);
    if (!c || !c.subscriptionPlan) continue;
    const price = findPrice(prices, c.subscriptionPlan, c.communityType);
    if (price) result.freeAccessCostCents += price.unitAmountCents;
  }

  return result;
}

export interface SanityCheckInput {
  computed: SnapshotComputation;
  priorMrrCents: number | null; // null if no prior snapshot exists
}

export interface SanityCheckResult {
  ok: boolean;
  reasons: string[];
}

export function runSanityChecks(input: SanityCheckInput): SanityCheckResult {
  const reasons: string[] = [];
  const { computed, priorMrrCents } = input;

  if (computed.mrrCents < 0) {
    reasons.push(`mrr_cents is negative: ${computed.mrrCents}`);
  }
  if (computed.potentialMrrCents < computed.mrrCents) {
    reasons.push(
      `potential_mrr_cents (${computed.potentialMrrCents}) < mrr_cents (${computed.mrrCents})`,
    );
  }
  if (priorMrrCents !== null && priorMrrCents > 0 && computed.mrrCents > priorMrrCents * 10) {
    reasons.push(
      `mrr_cents ${computed.mrrCents} > 10x prior ${priorMrrCents} — rejecting as anomaly`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}

export function computeMrrDeltaPct(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 10000) / 100; // 2 decimals
}
