/**
 * POST/GET /api/admin/internal/push-dispatch — the 15-minute web-push cron.
 *
 * ## This route has NO session, and that is why it must never forget its bearer
 *
 * `apps/admin/src/middleware.ts` lets `/api/admin/internal/` past the
 * platform-admin session gate, exactly as web's middleware does for
 * `/api/v1/internal/`. That exemption is only safe because every route beneath
 * it calls `requireCronSecret`, which fails closed on a missing, malformed or
 * wrong token — and `pnpm guard:internal-cron-auth` fails the build if one
 * stops calling it. The guard was extended to scan this root in the same commit
 * that opened the prefix; opening it without the guard would have put a
 * session-less POST on the deployment that holds the service-role key, covered
 * by nothing.
 *
 * ## Why GET as well as POST
 *
 * Vercel Cron issues `GET`. Nine web routes once had a POST-only entry in
 * middleware and every one of their jobs was dead in production while the
 * dashboard showed the cron firing. Both verbs are the same handler here; the
 * bearer check is identical on both.
 *
 * ## Why the failure cases answer 200
 *
 * Unconfigured VAPID keys return `{ configured: false }` with a 200. A cron
 * route that answers non-2xx is retried — indefinitely, in the Stripe-webhook
 * case this repo already paid for — and "no keys are installed yet" is a
 * deployment state that retrying cannot fix. An UNAUTHENTICATED call still gets
 * a 401: that is the one case where the caller is wrong rather than the
 * configuration.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

import { requireCronSecret } from '@/lib/api/cron-auth';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { dispatchPush } from '@/lib/server/push';

export const dynamic = 'force-dynamic';

/**
 * How often one process may report a rejected call. See `reportRejection`.
 *
 * An hour is four ticks of a fifteen-minute cron, so a genuinely
 * misconfigured `CRON_SECRET` still reports repeatedly and visibly, while a
 * caller hammering the route cannot mint one Sentry event per request.
 */
const REJECTION_REPORT_INTERVAL_MS = 60 * 60 * 1000;

let lastRejectionReportedAt = 0;

/**
 * Say something, somewhere, when this cron is turned away.
 *
 * Security MEDIUM-2. This is the first cron on the admin project, and it sits
 * outside the platform's cron observability entirely: `verify-cron-job-tagging`
 * pins `apps/web/vercel.json`, so there is no registry entry, no schedule
 * cross-check and no `cron_runs` heartbeat, which means neither the console's
 * own Health board nor `/api/v1/internal/cron-health` can see it. And a wrong or
 * missing `CRON_SECRET` throws `UnauthorizedError` — an `AppError`, which
 * `withAdminErrorHandler` RETURNS as a 401 without ever reaching Sentry.
 *
 * That is precisely the 2026-08 shape this repo already paid for: seventeen web
 * crons 401'd for months behind a green Vercel dashboard and produced zero
 * events. Alerting is a detective control, and here the thing failing silently
 * IS the alerting.
 *
 * THROTTLED, deliberately. The route is session-less by design, so anyone can
 * reach it; an uncapped capture would let a stranger burn the Sentry quota, and
 * "a wrapper outside the error handler turned an anonymous curl into a
 * month-long outage" is a trap this repo has already recorded once. Middleware
 * rate-limits the path at 100/min/IP as well, but that bounds the requests, not
 * the events.
 *
 * A heartbeat row would be the stronger control — a stopped scheduler is
 * invisible here, since a cron that never fires never gets rejected either. It
 * is deliberately not attempted in this change: `cron_runs` is registry-driven
 * and `guard:cron-job-tagging` reconciles that registry against
 * `apps/web/vercel.json` in both directions, so adding an admin slug means
 * teaching that guard a second root first.
 */
function reportRejection(request: NextRequest): void {
  const now = Date.now();
  if (now - lastRejectionReportedAt < REJECTION_REPORT_INTERVAL_MS) return;
  lastRejectionReportedAt = now;

  Sentry.captureMessage('push-dispatch cron rejected an unauthenticated call', {
    level: 'warning',
    tags: { cron: 'push-dispatch', outcome: 'unauthorized' },
    extra: {
      // Whether the SERVER has a secret at all is the fact that separates
      // "somebody probed the endpoint" from "this deployment cannot run its own
      // cron". The secret itself is never recorded.
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      hasAuthorizationHeader: request.headers.has('authorization'),
    },
  });
}

const handler = withAdminErrorHandler(async (request: NextRequest) => {
  // Throws UnauthorizedError -> 401 via withAdminErrorHandler. FIRST statement
  // in the handler: nothing above it may touch data.
  try {
    requireCronSecret(request, process.env.CRON_SECRET);
  } catch (error) {
    reportRejection(request);
    throw error;
  }

  const result = await dispatchPush();

  return NextResponse.json(
    { data: result },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

export const POST = handler;
export const GET = handler;
