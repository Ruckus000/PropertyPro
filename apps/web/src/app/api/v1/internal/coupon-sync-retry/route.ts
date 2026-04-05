/**
 * POST /api/v1/internal/coupon-sync-retry
 *
 * Every 10 minutes, retry billing groups stuck in coupon_sync_status='failed' or 'pending'
 * for more than 5 minutes. This recovers from transient Stripe failures.
 *
 * Auth: cron secret (COUPON_SYNC_RETRY_CRON_SECRET, falling back to CRON_SECRET in local/dev)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups } from '@propertypro/db';
import { and, lt, inArray, isNull } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { recalculateVolumeTier } from '@/lib/billing/billing-group-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(
    req,
    process.env.COUPON_SYNC_RETRY_CRON_SECRET ?? process.env.CRON_SECRET,
  );

  const db = createUnscopedClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Find billing groups stuck in failed/pending for more than 5 minutes
  const stuck = await db
    .select({ id: billingGroups.id })
    .from(billingGroups)
    .where(
      and(
        inArray(billingGroups.couponSyncStatus, ['failed', 'pending']),
        lt(billingGroups.updatedAt, fiveMinAgo),
        isNull(billingGroups.deletedAt),
      ),
    )
    .limit(50);

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
