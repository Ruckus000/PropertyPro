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
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={`/tenants/invite?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Add Tenant
        </a>
        <a
          href={`/announcements/new?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Post Announcement
        </a>
        <a
          href={`/maintenance/new?communityId=${communityId}`}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
