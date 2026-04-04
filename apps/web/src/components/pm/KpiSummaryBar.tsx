'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

interface KpiSummaryBarProps {
  kpis: PortfolioDashboardData['kpis'] | undefined;
  isLoading?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const KPI_ITEMS: {
  key: keyof PortfolioDashboardData['kpis'];
  shortLabel: string;
  format: (v: number) => string;
}[] = [
  { key: 'totalUnits', shortLabel: 'Units', format: (v) => v.toLocaleString() },
  { key: 'occupancyRate', shortLabel: 'Occupancy', format: (v) => `${v}%` },
  { key: 'openMaintenance', shortLabel: 'Open Maint.', format: (v) => v.toLocaleString() },
  { key: 'complianceScore', shortLabel: 'Compliance', format: (v) => `${v}%` },
  { key: 'delinquencyTotal', shortLabel: 'Delinquency', format: formatCurrency },
];

export function KpiSummaryBar({ kpis, isLoading }: KpiSummaryBarProps) {
  if (isLoading || !kpis) {
    return (
      <div className="flex items-center gap-4 rounded-md border border-edge bg-surface-card px-4 py-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-edge bg-surface-card px-4 py-2.5 text-sm">
      {KPI_ITEMS.map(({ key, shortLabel, format }, i) => (
        <div key={key} className="flex items-center gap-1.5">
          {i > 0 && (
            <div className="mr-2.5 hidden h-4 w-px bg-edge sm:block" aria-hidden="true" />
          )}
          <span className="text-content-secondary">{shortLabel}</span>
          <span className="font-semibold text-content">{format(kpis[key].value)}</span>
        </div>
      ))}
    </div>
  );
}
