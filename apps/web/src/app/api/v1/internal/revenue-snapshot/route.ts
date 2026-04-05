/**
 * POST /api/v1/internal/revenue-snapshot
 *
 * Daily cron job — computes MRR snapshot, reconciles against Stripe API,
 * runs sanity checks, and appends one row to revenue_snapshots.
 *
 * Auth: Bearer token matching REVENUE_SNAPSHOT_CRON_SECRET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { captureMessage } from '@sentry/nextjs';
import { and, desc, gt, isNull } from '@propertypro/db/filters';
import {
  accessPlans,
  billingGroups,
  communities,
  revenueSnapshots,
  stripePrices,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { getStripeClient } from '@/lib/services/stripe-service';
import {
  computeSnapshot,
  computeMrrDeltaPct,
  runSanityChecks,
  type CommunityRow,
  type PriceRow,
  type BillingGroupRow,
  type AccessPlanRow,
} from '@/lib/services/revenue-snapshot-service';

// DO NOT use withErrorHandler — we want explicit control over responses here.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.REVENUE_SNAPSHOT_CRON_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createUnscopedClient();

  // Load inputs
  const allCommunities = await db
    .select({
      id: communities.id,
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionPlan: communities.subscriptionPlan,
      communityType: communities.communityType,
      billingGroupId: communities.billingGroupId,
      deletedAt: communities.deletedAt,
      isDemo: communities.isDemo,
    })
    .from(communities);

  const prices = await db
    .select({
      planId: stripePrices.planId,
      communityType: stripePrices.communityType,
      billingInterval: stripePrices.billingInterval,
      unitAmountCents: stripePrices.unitAmountCents,
    })
    .from(stripePrices);

  const groups = await db
    .select({
      id: billingGroups.id,
      volumeTier: billingGroups.volumeTier,
      activeCommunityCount: billingGroups.activeCommunityCount,
    })
    .from(billingGroups)
    .where(isNull(billingGroups.deletedAt));

  const now = new Date();
  const activePlans = await db
    .select({ communityId: accessPlans.communityId })
    .from(accessPlans)
    .where(
      and(
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
        gt(accessPlans.graceEndsAt, now),
      ),
    );

  // Compute snapshot
  let computation;
  try {
    computation = computeSnapshot({
      communities: allCommunities as CommunityRow[],
      prices: prices as PriceRow[],
      billingGroups: groups as BillingGroupRow[],
      accessPlans: activePlans as AccessPlanRow[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    captureMessage('revenue_snapshot_compute_error', {
      level: 'error',
      extra: { message },
    });
    return NextResponse.json({ error: 'compute_error', message }, { status: 500 });
  }

  // Fetch latest prior snapshot for delta + sanity check
  const [prior] = await db
    .select({ mrrCents: revenueSnapshots.mrrCents })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.snapshotDate), desc(revenueSnapshots.computedAt))
    .limit(1);

  const priorMrr = prior?.mrrCents ?? null;

  // Sanity checks
  const check = runSanityChecks({ computed: computation, priorMrrCents: priorMrr });
  if (!check.ok) {
    captureMessage('revenue_snapshot_sanity_check_failed', {
      level: 'error',
      extra: { reasons: check.reasons, mrrCents: computation.mrrCents, priorMrr },
    });
    return NextResponse.json({ error: 'sanity_check_failed', reasons: check.reasons }, { status: 500 });
  }

  // Reconciliation against Stripe
  let reconciliationDriftPct: number | null = null;
  try {
    const stripe = getStripeClient();
    const activeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
    const stripeActiveCount = activeSubs.data.length;
    const dbActiveCount = computation.activeSubscriptions;
    if (dbActiveCount > 0) {
      reconciliationDriftPct =
        Math.round(
          (Math.abs(stripeActiveCount - dbActiveCount) / dbActiveCount) * 10000,
        ) / 100;
    }
  } catch (err) {
    captureMessage('revenue_snapshot_reconciliation_failed', {
      level: 'warning',
      extra: { error: err instanceof Error ? err.message : String(err) },
    });
    // Do not fail the snapshot — proceed with null drift.
  }

  const deltaPct = computeMrrDeltaPct(computation.mrrCents, priorMrr);

  // Insert the snapshot (append-only)
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await db.insert(revenueSnapshots).values({
    snapshotDate: today,
    mrrCents: computation.mrrCents,
    potentialMrrCents: computation.potentialMrrCents,
    activeSubscriptions: computation.activeSubscriptions,
    trialingSubscriptions: computation.trialingSubscriptions,
    pastDueSubscriptions: computation.pastDueSubscriptions,
    byPlan: computation.byPlan,
    byCommunityType: computation.byCommunityType,
    volumeDiscountSavingsCents: computation.volumeDiscountSavingsCents,
    freeAccessCostCents: computation.freeAccessCostCents,
    pricesVersion: computation.pricesVersion,
    reconciliationDriftPct: reconciliationDriftPct?.toString() ?? null,
    communitiesSkipped: computation.communitiesSkipped,
    mrrDeltaPct: deltaPct?.toString() ?? null,
  });

  // Structured log for observability
  captureMessage('revenue_snapshot', {
    level: 'info',
    extra: {
      event: 'revenue_snapshot',
      mrr_cents: computation.mrrCents,
      potential_mrr_cents: computation.potentialMrrCents,
      active: computation.activeSubscriptions,
      trialing: computation.trialingSubscriptions,
      past_due: computation.pastDueSubscriptions,
      drift_pct: reconciliationDriftPct,
      delta_pct: deltaPct,
      communities_skipped: computation.communitiesSkipped,
      prices_version: computation.pricesVersion,
    },
  });

  // Drift warnings
  if (reconciliationDriftPct !== null && reconciliationDriftPct > 5) {
    captureMessage('revenue_snapshot_drift_high', {
      level: 'warning',
      extra: { drift_pct: reconciliationDriftPct },
    });
  }
  if (deltaPct !== null && Math.abs(deltaPct) > 20) {
    captureMessage('revenue_snapshot_delta_high', {
      level: 'warning',
      extra: { delta_pct: deltaPct, mrr_cents: computation.mrrCents, prior_mrr_cents: priorMrr },
    });
  }

  return NextResponse.json({
    snapshot_date: today,
    mrr_cents: computation.mrrCents,
    potential_mrr_cents: computation.potentialMrrCents,
    active: computation.activeSubscriptions,
    trialing: computation.trialingSubscriptions,
    past_due: computation.pastDueSubscriptions,
    drift_pct: reconciliationDriftPct,
    delta_pct: deltaPct,
    communities_skipped: computation.communitiesSkipped,
  });
}
