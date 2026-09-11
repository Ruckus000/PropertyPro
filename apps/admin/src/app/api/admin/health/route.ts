/**
 * GET /api/admin/health — the full health report, as JSON.
 *
 * NOT to be confused with `/api/health`, two path segments away, which is the
 * admin app's own unauthenticated liveness probe and is one of the things THIS
 * endpoint reports on. The distinction is the gate: that one answers anybody in
 * 200 bytes; this one runs six outbound probes plus two privileged reads and is
 * `super_admin` only.
 *
 * The Health page does not need this — it is a Server Component and calls
 * `getHealthReport()` directly. This exists for the client-side refresh and for
 * an operator who wants the raw numbers (a latency, a backlog count) without
 * reading them off pills.
 *
 * Why the gate is not optional: `ServiceStatus.meta` carries upstream error
 * messages verbatim (a Postgres failure, a Stripe API message), and
 * `FailedJob.error` is `cron_runs.last_error`, which the web app's own
 * unauthenticated `cron-health` probe deliberately withholds because it can
 * contain query text and table internals. So this body is strictly more
 * sensitive than anything `/api/health` returns.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getHealthReport } from '@/lib/server/health';
import { resolveAdminOrigin } from '@/lib/server/request-origin';

export const dynamic = 'force-dynamic';

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  return NextResponse.json({
    data: await getHealthReport({ adminOrigin: resolveAdminOrigin(request.headers) }),
  });
});
