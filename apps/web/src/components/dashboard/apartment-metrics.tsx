/**
 * Apartment metrics card grid — P2-36
 *
 * Renders four metric cards consistent with the existing dashboard card style
 * (rounded-md border border-edge bg-surface-card p-5).
 */
import type { ApartmentMetrics } from '@/lib/queries/apartment-metrics';

interface ApartmentMetricsProps {
  metrics: ApartmentMetrics;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  subDetail?: string;
  badge?: 'warning' | 'urgent';
}

function MetricCard({ title, value, detail, subDetail, badge }: MetricCardProps) {
  return (
    <div className="rounded-md border border-edge bg-surface-card p-5">
      <p className="text-sm font-medium text-content-secondary">{title}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-3xl font-semibold text-content">{value}</p>
        {badge === 'urgent' && (
          <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger">
            Action needed
          </span>
        )}
        {badge === 'warning' && (
          <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-semibold text-status-warning">
            Review
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-content-secondary">{detail}</p>
      {subDetail && <p className="mt-0.5 text-xs text-content-disabled">{subDetail}</p>}
    </div>
  );
}

export function ApartmentMetricsCards({ metrics }: ApartmentMetricsProps) {
  const { within30Days, within60Days, within90Days } = metrics.leaseExpirations;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Occupancy"
        value={`${metrics.occupancyRate}%`}
        detail={`${metrics.occupiedUnits} occupied · ${metrics.vacantUnits} vacant`}
        subDetail={`${metrics.totalUnits} total units`}
        badge={metrics.vacantUnits > 0 && metrics.occupancyRate < 80 ? 'warning' : undefined}
      />
      <MetricCard
        title="Lease Expirations"
        value={String(within30Days)}
        detail="expiring within 30 days"
        subDetail={`60d: ${within60Days} · 90d: ${within90Days}`}
        badge={within30Days > 0 ? 'urgent' : undefined}
      />
      <MetricCard
        title="Monthly Revenue"
        value={formatCurrency(metrics.totalMonthlyRevenue)}
        detail="from active leases"
      />
      <MetricCard
        title="Maintenance"
        value={String(metrics.openMaintenanceRequests)}
        detail="open requests"
        badge={metrics.openMaintenanceRequests > 5 ? 'warning' : undefined}
      />
    </div>
  );
}
