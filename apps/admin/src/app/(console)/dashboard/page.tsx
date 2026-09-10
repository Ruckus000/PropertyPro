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
import { getShellSignals } from '@/lib/server/shell-signals';

export const dynamic = 'force-dynamic';

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const session = await requireAdminPageSession();
  const [stats, series, signals] = await Promise.all([
    getPlatformDashboardStats(),
    getDashboardSeries(),
    getShellSignals(),
  ]);

  const now = new Date();
  const firstName = session.email.split('@')[0] || 'there';
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);

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
