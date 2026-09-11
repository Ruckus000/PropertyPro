/**
 * /health — the platform health board (spec D18-D20).
 *
 * Service probes, unresolved production errors, and scheduled work that has
 * stopped running — with a one-click retry for the cron jobs that have an
 * endpoint behind them.
 *
 * The route predates this body: the rail has linked here since Wave 1, and an
 * unmatched URL renders the ROOT not-found, which sits OUTSIDE this route group
 * — no rail, no top bar, no way back. That is why a placeholder shipped first,
 * and why `requireAdminPageSession()` stays on the first line.
 *
 * ## Why this page cannot throw
 *
 * It is the screen an operator opens BECAUSE something is already broken. A
 * report that propagated its own probe failures would hand them a 500 on the one
 * surface that has to render during an outage, so `getHealthReport()` catches
 * every probe and loader internally and returns a report full of `down` instead.
 * Nothing here needs a try/catch of its own.
 *
 * All four data states are covered, per `.claude/rules/design.md`: loading lives
 * in `loading.tsx` (the route is `force-dynamic`, so the Suspense boundary is
 * real), empty is handled inside each section's component, error surfaces as
 * `down`/`degraded` tiles and the Sentry banner, and success is the board.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { headers } from 'next/headers';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { ErrorsList } from '@/components/health/ErrorsList';
import { FailedJobsList } from '@/components/health/FailedJobsList';
import { HealthFreshness } from '@/components/health/HealthFreshness';
import { ServicesStrip } from '@/components/health/ServicesStrip';
import { PageBody } from '@propertypro/ui';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getHealthReport } from '@/lib/server/health';
import { resolveAdminOrigin } from '@/lib/server/request-origin';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireAdminPageSession();

  const report = await getHealthReport({
    // Validated, not taken at face value — see `resolveAdminOrigin` for why a
    // Host header is not a fact.
    adminOrigin: resolveAdminOrigin(await headers()),
  });

  return (
    <PageBody>
      <AdminPageHeader
        title="Health"
        description="Production errors, failed jobs and service status."
      />

      <HealthFreshness checkedAt={report.checkedAt} />

      <ServicesStrip services={report.services} />
      <ErrorsList errors={report.errors} />
      <FailedJobsList jobs={report.jobs} />
    </PageBody>
  );
}
