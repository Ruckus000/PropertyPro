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
import { NextResponse, type NextRequest } from 'next/server';

import { requireCronSecret } from '@/lib/api/cron-auth';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { dispatchPush } from '@/lib/server/push';

export const dynamic = 'force-dynamic';

const handler = withAdminErrorHandler(async (request: NextRequest) => {
  // Throws UnauthorizedError -> 401 via withAdminErrorHandler. FIRST statement
  // in the handler: nothing above it may touch data.
  requireCronSecret(request, process.env.CRON_SECRET);

  const result = await dispatchPush();

  return NextResponse.json(
    { data: result },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

export const POST = handler;
export const GET = handler;
