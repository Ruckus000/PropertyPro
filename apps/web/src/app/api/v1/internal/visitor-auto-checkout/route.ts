/**
 * POST /api/v1/internal/visitor-auto-checkout
 *
 * Hourly cron: auto-checkout visitors whose expected duration has elapsed.
 *
 * Authorization contract: this route's cross-community UPDATE is wrapped by
 * `autoCheckoutOverdueVisitors` in `visitor-cron-service`. Write scope is
 * intentionally limited to `checked_out_at` and `updated_at` on `visitor_log`.
 *
 * Schedule: 0 * * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { autoCheckoutOverdueVisitors } from '@/lib/services/visitor-cron-service';
import { withCronJob } from '@/lib/cron/with-cron-job';

const handler = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET, process.env.CRON_SECRET);

  const errors: string[] = [];

  /*
   * No outer try/catch, deliberately.
   *
   * This route used to wrap its ENTIRE body in one catch and return
   * `{ autoCheckedOut: 0, errors }` with HTTP 200. A dead database produced a
   * 200. There was no console.error and no Sentry capture, so the job could
   * have been permanently broken while every dashboard showed it healthy —
   * strictly worse than the #1042 outage, which at least 500'd loudly.
   *
   * Letting the throw reach `withErrorHandler` gives a real 500 plus a
   * `job`-tagged Sentry event. The per-audit-event failures below are a
   * genuine PARTIAL failure and stay in `errors`, where `withCronJob`'s
   * summary scan now reports them.
   */
  {
    const overdue = await autoCheckoutOverdueVisitors();
    const now = new Date();

    // Emit a single bulk audit event per community
    const byCommunity = new Map<number, number[]>();
    for (const row of overdue) {
      const ids = byCommunity.get(row.communityId) ?? [];
      ids.push(row.id);
      byCommunity.set(row.communityId, ids);
    }

    const auditPromises = [];
    for (const [communityId, ids] of byCommunity) {
      auditPromises.push(logAuditEvent({
        userId: null,
        communityId,
        action: 'update',
        resourceType: 'visitor_log',
        resourceId: ids.join(','),
        newValues: { checkedOutAt: now },
        metadata: { transition: 'auto_checkout', count: ids.length },
      }));
    }
    const auditResults = await Promise.allSettled(auditPromises);
    for (const result of auditResults) {
      if (result.status === 'rejected') {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    return NextResponse.json({
      data: { autoCheckedOut: overdue.length, errors },
    });
  }
});

// Vercel Cron issues GET; the GitHub-Actions era of this job issued POST.
// One handler serves both so the scheduler's verb can never be the thing that
// breaks the job. Neither verb reads a body or query params, so they are
// genuinely interchangeable.
const cronHandler = withCronJob('visitor-auto-checkout', handler);

export const GET = cronHandler;
export const POST = cronHandler;
