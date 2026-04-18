'use client';

import { DollarSign, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { KpiCard } from '@/components/shared/kpi-card';
import { useAssessments, useDelinquency } from '@/hooks/use-finance';

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ─────── Component ─────── */

interface FinanceKpiRowProps {
  communityId: number;
  delinquencyEnabled?: boolean;
}

export function FinanceKpiRow({
  communityId,
  delinquencyEnabled = false,
}: FinanceKpiRowProps) {
  const { data: assessments, isLoading: assessmentsLoading } = useAssessments(communityId);
  const { data: delinquent, isLoading: delinquentLoading } = useDelinquency(communityId, {
    enabled: delinquencyEnabled,
  });

  // Total assessed = sum of active assessment amounts
  const totalAssessedCents =
    assessments
      ?.filter((a) => a.isActive)
      .reduce((sum, a) => sum + a.amountCents, 0) ?? 0;

  // Overdue balance from delinquency data
  const overdueCents =
    delinquent?.reduce((sum, d) => sum + d.overdueAmountCents, 0) ?? 0;

  // Delinquent unit count
  const delinquentCount = delinquent?.length ?? 0;
  const delinquencyValue = delinquencyEnabled ? formatCents(overdueCents) : '--';
  const delinquentUnitsValue = delinquencyEnabled ? String(delinquentCount) : '--';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Total Assessed"
        value={formatCents(totalAssessedCents)}
        icon={DollarSign}
        isLoading={assessmentsLoading}
      />
      <KpiCard
        title="Collected This Month"
        value="--"
        icon={CheckCircle}
        isLoading={false}
      />
      <KpiCard
        title="Overdue Balance"
        value={delinquencyValue}
        icon={AlertTriangle}
        isLoading={delinquentLoading}
      />
      <KpiCard
        title="Delinquent Units"
        value={delinquentUnitsValue}
        icon={Users}
        isLoading={delinquentLoading}
      />
    </div>
  );
}
