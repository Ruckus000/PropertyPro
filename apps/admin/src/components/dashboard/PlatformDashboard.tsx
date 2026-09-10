/**
 * Platform Dashboard — landing page for the admin console.
 *
 * Renders the page's only `<h1>` (via `AdminPageHeader`), then the KPI grid
 * (spec D25), then a two-column row: the needs-attention queue beside
 * revenue and subscription summaries.
 */
import Link from 'next/link';
import { Button } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import type { PlatformDashboardStats } from '@/lib/server/dashboard';
import type { DashboardSeries } from '@/lib/server/dashboard-series';
import type { ShellSignals } from '@/lib/server/shell-signals';
import { AttentionQueue } from './AttentionQueue';
import { KpiGrid } from './KpiGrid';
import { RevenueCard } from './RevenueCard';
import { SubscriptionsCard } from './SubscriptionsCard';

interface PlatformDashboardProps {
  stats: PlatformDashboardStats;
  series: DashboardSeries;
  signals: ShellSignals;
  greeting: string;
  firstName: string;
  today: string;
}

export function PlatformDashboard({ stats, series, signals, greeting, firstName, today }: PlatformDashboardProps) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Overview"
        description={`${greeting}, ${firstName} · ${today} · ${stats.overview.communities} communities`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/demo/new">New demo</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/tickets/new">New ticket</Link>
            </Button>
          </>
        }
      />

      <KpiGrid stats={stats} series={series} signals={signals} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AttentionQueue signals={signals} />
        <div className="space-y-6">
          <RevenueCard series={series} />
          <SubscriptionsCard billing={stats.billing} />
        </div>
      </div>
    </div>
  );
}
