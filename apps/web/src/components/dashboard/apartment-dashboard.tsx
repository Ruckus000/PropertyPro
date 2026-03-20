/**
 * Apartment operational dashboard layout — P2-36
 *
 * Composes metric cards, recent announcements, and quick action links.
 * Reuses DashboardAnnouncements without modification.
 */
import type { ApartmentMetrics } from '@/lib/queries/apartment-metrics';
import { ApartmentMetricsCards } from './apartment-metrics';
import { DashboardAnnouncements } from './dashboard-announcements';

interface ApartmentDashboardProps {
  metrics: ApartmentMetrics;
  communityId: number;
}

interface QuickActionsProps {
  communityId: number;
}

function QuickActions({ communityId }: QuickActionsProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Quick Actions</h2>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={`/tenants/invite?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          Add Tenant
        </a>
        <a
          href={`/announcements/new?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          Post Announcement
        </a>
        <a
          href={`/maintenance/new?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          New Maintenance Request
        </a>
      </div>
    </section>
  );
}

export function ApartmentDashboard({ metrics, communityId }: ApartmentDashboardProps) {
  return (
    <div className="space-y-6">
      <ApartmentMetricsCards metrics={metrics} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements items={metrics.announcements} />
        <QuickActions communityId={communityId} />
      </div>
    </div>
  );
}
