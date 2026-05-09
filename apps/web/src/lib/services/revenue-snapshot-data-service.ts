/**
 * Revenue Snapshot Data Service
 *
 * Database-touching helpers for the revenue-snapshot cron + health routes.
 * Kept separate from `revenue-snapshot-service.ts` (which is intentionally
 * pure-computation, no DB/Stripe deps) so that file's testability stays
 * intact.
 *
 * AUTHZ: cron/probe-only — caller MUST validate the relevant secret BEFORE
 * invoking. Operates against the platform-wide `revenue_snapshots` table.
 *
 * Companions:
 *   - apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts (POST cron)
 *   - apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts (GET probe)
 */
import {
  accessPlans,
  billingGroups,
  communities,
  revenueSnapshots,
  stripePrices,
} from '@propertypro/db';
import { and, desc, gt, isNull } from '@propertypro/db/filters';
// AUTHZ: Revenue snapshot cron + health — platform-wide metrics, not tenant-scoped. Caller MUST validate the relevant secret before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface LatestSnapshotForHealth {
  computedAt: Date;
}

/**
 * Fetch only the `computedAt` timestamp of the most recently written
 * revenue snapshot. Returns `null` when no snapshot has ever been written.
 *
 * Used by the health probe to detect cron staleness without loading the
 * full row.
 */
export async function getLatestRevenueSnapshotForHealth(): Promise<LatestSnapshotForHealth | null> {
  const db = createUnscopedClient();
  const [latest] = await db
    .select({ computedAt: revenueSnapshots.computedAt })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.computedAt))
    .limit(1);
  return latest ?? null;
}

// ---------------------------------------------------------------------------
// Cron compute helpers (used by /api/v1/internal/revenue-snapshot POST)
// ---------------------------------------------------------------------------

import type {
  CommunityRow,
  PriceRow,
  BillingGroupRow,
  AccessPlanRow,
  SnapshotComputation,
} from './revenue-snapshot-service';

/** All snapshot inputs in one round-trip-bundled load. */
export interface RevenueSnapshotInputs {
  communities: CommunityRow[];
  prices: PriceRow[];
  billingGroups: BillingGroupRow[];
  accessPlans: AccessPlanRow[];
}

/**
 * Load every input needed to compute one snapshot. All four reads run in
 * parallel since they're independent. Unbounded SELECTs are fine at current
 * scale (~250 communities); switch to cursor-based pagination here if
 * community count exceeds ~5K.
 */
export async function loadRevenueSnapshotInputs(now: Date): Promise<RevenueSnapshotInputs> {
  const db = createUnscopedClient();
  const [communitiesRows, pricesRows, groupsRows, plansRows] = await Promise.all([
    db
      .select({
        id: communities.id,
        subscriptionStatus: communities.subscriptionStatus,
        subscriptionPlan: communities.subscriptionPlan,
        communityType: communities.communityType,
        billingGroupId: communities.billingGroupId,
        deletedAt: communities.deletedAt,
        isDemo: communities.isDemo,
      })
      .from(communities),
    db
      .select({
        planId: stripePrices.planId,
        communityType: stripePrices.communityType,
        billingInterval: stripePrices.billingInterval,
        unitAmountCents: stripePrices.unitAmountCents,
      })
      .from(stripePrices),
    db
      .select({
        id: billingGroups.id,
        volumeTier: billingGroups.volumeTier,
        activeCommunityCount: billingGroups.activeCommunityCount,
      })
      .from(billingGroups)
      .where(isNull(billingGroups.deletedAt)),
    db
      .select({ communityId: accessPlans.communityId })
      .from(accessPlans)
      .where(
        and(
          isNull(accessPlans.revokedAt),
          isNull(accessPlans.convertedAt),
          gt(accessPlans.graceEndsAt, now),
        ),
      ),
  ]);
  return {
    communities: communitiesRows as CommunityRow[],
    prices: pricesRows as PriceRow[],
    billingGroups: groupsRows as BillingGroupRow[],
    accessPlans: plansRows as AccessPlanRow[],
  };
}

/**
 * Fetch the prior snapshot's MRR for delta + sanity-check inputs. Returns
 * `null` when no prior snapshot exists. Order is `(snapshotDate desc,
 * computedAt desc)` so we get the most recent date's most recent compute.
 */
export async function getPriorSnapshotMrr(): Promise<number | null> {
  const db = createUnscopedClient();
  const [prior] = await db
    .select({ mrrCents: revenueSnapshots.mrrCents })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.snapshotDate), desc(revenueSnapshots.computedAt))
    .limit(1);
  return prior?.mrrCents ?? null;
}

/** Snapshot persist payload — caller passes all derived fields. */
export interface RevenueSnapshotInsert {
  snapshotDate: string; // YYYY-MM-DD
  computation: SnapshotComputation;
  reconciliationDriftPct: number | null;
  deltaPct: number | null;
}

/**
 * Insert a single snapshot row (append-only). Caller assembles the payload
 * from `computeSnapshot` + reconciliation drift + MRR delta.
 */
export async function insertRevenueSnapshot(input: RevenueSnapshotInsert): Promise<void> {
  const db = createUnscopedClient();
  await db.insert(revenueSnapshots).values({
    snapshotDate: input.snapshotDate,
    mrrCents: input.computation.mrrCents,
    potentialMrrCents: input.computation.potentialMrrCents,
    activeSubscriptions: input.computation.activeSubscriptions,
    trialingSubscriptions: input.computation.trialingSubscriptions,
    pastDueSubscriptions: input.computation.pastDueSubscriptions,
    byPlan: input.computation.byPlan,
    byCommunityType: input.computation.byCommunityType,
    volumeDiscountSavingsCents: input.computation.volumeDiscountSavingsCents,
    freeAccessCostCents: input.computation.freeAccessCostCents,
    pricesVersion: input.computation.pricesVersion,
    reconciliationDriftPct: input.reconciliationDriftPct?.toString() ?? null,
    communitiesSkipped: input.computation.communitiesSkipped,
    mrrDeltaPct: input.deltaPct?.toString() ?? null,
  });
}
