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
import { requireCronSecret } from '@/lib/api/cron-auth';
import { getStripeClient } from '@/lib/services/stripe-service';
import {
  computeSnapshot,
  computeMrrDeltaPct,
  runSanityChecks,
} from '@/lib/services/revenue-snapshot-service';
import {
  getPriorSnapshotMrr,
  insertRevenueSnapshot,
  loadRevenueSnapshotInputs,
} from '@/lib/services/revenue-snapshot-data-service';

// DO NOT use withErrorHandler — we want explicit control over responses here.
async function handleRevenueSnapshot(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.REVENUE_SNAPSHOT_CRON_SECRET, process.env.CRON_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const inputs = await loadRevenueSnapshotInputs(now);

  // Compute snapshot
  let computation;
  try {
    computation = computeSnapshot({
      communities: inputs.communities,
      prices: inputs.prices,
      billingGroups: inputs.billingGroups,
      accessPlans: inputs.accessPlans,
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
  const priorMrr = await getPriorSnapshotMrr();

  // Sanity checks
  const check = runSanityChecks({ computed: computation, priorMrrCents: priorMrr });
  if (!check.ok) {
    captureMessage('revenue_snapshot_sanity_check_failed', {
      level: 'error',
      extra: { reasons: check.reasons, mrrCents: computation.mrrCents, priorMrr },
    });
    return NextResponse.json({ error: 'sanity_check_failed', reasons: check.reasons }, { status: 500 });
  }

  // Reconciliation against Stripe — paginate to get full count
  let reconciliationDriftPct: number | null = null;
  try {
    const stripe = getStripeClient();
    let stripeActiveCount = 0;
    for await (const _sub of stripe.subscriptions.list({ status: 'active' })) {
      stripeActiveCount += 1;
    }
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
  await insertRevenueSnapshot({
    snapshotDate: today,
    computation,
    reconciliationDriftPct,
    deltaPct,
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

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
export const GET = handleRevenueSnapshot;
export const POST = handleRevenueSnapshot;
