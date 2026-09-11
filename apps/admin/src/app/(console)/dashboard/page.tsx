/**
 * Platform Dashboard route — see `components/dashboard/PlatformDashboard`
 * for what's on the page. `AdminPageHeader` (this page's only `<h1>`) lives
 * inside that component, not here, since it needs `stats`/`greeting` to
 * build its description.
 */
import { PageBody } from '@propertypro/ui';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getPlatformDashboardStats } from '@/lib/server/dashboard';
import { getDashboardSeries } from '@/lib/server/dashboard-series';
import { getPreferences } from '@/lib/server/preferences';
import { getShellSignals } from '@/lib/server/shell-signals';
import { formatPlatformDate, greetingFor } from '@/lib/utils/platform-clock';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireAdminPageSession();
  // The SAME argument the console layout passes, and it has to be: `cache()`
  // keys on it, so a literal here (or no argument at all) would give this page
  // its own cache entry and run all seven providers a second time on every
  // dashboard render. `getPreferences` is itself `cache()`d, so resolving it in
  // both places is one query per request.
  const preferences = await getPreferences(session.id);
  const [stats, series, signals] = await Promise.all([
    getPlatformDashboardStats(),
    getDashboardSeries(),
    getShellSignals(preferences.alertPrefs.errorSpikeThreshold),
  ]);

  // Both values are on the PLATFORM clock, not the server's. This page renders
  // server-side and Vercel's server is UTC, so `getHours()` / an unzoned
  // formatter showed a Florida operator tomorrow's date and the wrong greeting
  // all evening — see `lib/utils/platform-clock.ts`.
  const now = new Date();
  const firstName = session.email.split('@')[0] || 'there';
  const today = formatPlatformDate(now);

  return (
    <PageBody>
      <PlatformDashboard
        stats={stats}
        series={series}
        signals={signals}
        greeting={greetingFor(now)}
        firstName={firstName}
        today={today}
      />
    </PageBody>
  );
}
