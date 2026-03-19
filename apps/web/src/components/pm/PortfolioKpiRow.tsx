'use client';

import { Building2, Users, Wrench, Shield, DollarSign, Calendar } from 'lucide-react';
import { KpiCard } from '@/components/shared/kpi-card';
import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

interface PortfolioKpiRowProps {
  kpis: PortfolioDashboardData['kpis'] | undefined;
  isLoading: boolean;
}

export function PortfolioKpiRow({ kpis, isLoading }: PortfolioKpiRowProps) {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCard key={i} title="" value="" isLoading />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        title={kpis.totalUnits.label}
        value={kpis.totalUnits.value.toLocaleString()}
        delta={kpis.totalUnits.delta}
        trend={kpis.totalUnits.trend}
        icon={Building2}
      />
      <KpiCard
        title={kpis.occupancyRate.label}
        value={`${kpis.occupancyRate.value}%`}
        delta={kpis.occupancyRate.delta}
        trend={kpis.occupancyRate.trend}
        icon={Users}
      />
      <KpiCard
        title={kpis.openMaintenance.label}
        value={kpis.openMaintenance.value.toLocaleString()}
        delta={kpis.openMaintenance.delta}
        trend={kpis.openMaintenance.trend}
        invertTrend
        icon={Wrench}
      />
      <KpiCard
        title={kpis.complianceScore.label}
        value={`${kpis.complianceScore.value}%`}
        delta={kpis.complianceScore.delta}
        trend={kpis.complianceScore.trend}
        icon={Shield}
      />
      <KpiCard
        title={kpis.delinquencyTotal.label}
        value={formatCurrency(kpis.delinquencyTotal.value)}
        delta={kpis.delinquencyTotal.delta}
        trend={kpis.delinquencyTotal.trend}
        invertTrend
        icon={DollarSign}
      />
      <KpiCard
        title={kpis.expiringLeases.label}
        value={kpis.expiringLeases.value.toLocaleString()}
        delta={kpis.expiringLeases.delta}
        trend={kpis.expiringLeases.trend}
        icon={Calendar}
      />
    </div>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
