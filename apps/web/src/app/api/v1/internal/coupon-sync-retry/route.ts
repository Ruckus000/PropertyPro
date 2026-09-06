/**
 * POST /api/v1/internal/coupon-sync-retry
 *
 * Every 10 minutes, retry billing groups stuck in coupon_sync_status='failed' or 'pending'
 * for more than 5 minutes. This recovers from transient Stripe failures.
 *
 * Auth: cron secret (COUPON_SYNC_RETRY_CRON_SECRET, falling back to CRON_SECRET in local/dev)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  findStuckCouponSyncBillingGroups,
  recalculateVolumeTier,
} from '@/lib/billing/billing-group-service';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.COUPON_SYNC_RETRY_CRON_SECRET, process.env.CRON_SECRET);

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const stuck = await findStuckCouponSyncBillingGroups({
    stuckSinceBefore: fiveMinAgo,
    limit: 50,
  });

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const row of stuck) {
    try {
      await recalculateVolumeTier(row.id);
      results.push({ id: row.id, ok: true });
    } catch (e) {
      results.push({
        id: row.id,
        ok: false,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
const cronHandler = withCronJob('coupon-sync-retry', handler);

export const GET = cronHandler;
export const POST = cronHandler;
