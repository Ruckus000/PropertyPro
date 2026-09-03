'use client';

import { DollarSign, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { KpiCard } from '@/components/shared/kpi-card';
import { useDelinquency, useLedger, useRecentPayments } from '@/hooks/use-finance';

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * The current calendar month in the viewer's local time, as the date-only
 * strings the ledger route filters `effectiveDate` on (inclusive both ends).
 * `new Date(y, m + 1, 0)` is the last day of month m; only its day-of-month is
 * read, so a DST crossing inside the month cannot move it.
 */
function currentMonthRange(now: Date): { startDate: string; endDate: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    startDate: `${year}-${pad(month + 1)}-01`,
    endDate: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

function isInSameMonth(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/**
 * The ledger read is clamped server-side to 500 rows
 * (packages/db/src/queries/ledger.ts). The hook's 200 default covers one
 * monthly assessment on a 124-unit community; a special assessment in the
 * same month puts it past 200, and a truncated list would silently
 * under-report what was billed. Ask for the cap.
 */
const LEDGER_ROW_CAP = 500;

/* ─────── Component ─────── */

interface FinanceKpiRowProps {
  communityId: number;
  delinquencyEnabled?: boolean;
}

export function FinanceKpiRow({
  communityId,
  delinquencyEnabled = false,
}: FinanceKpiRowProps) {
  const now = new Date();
  const { startDate, endDate } = currentMonthRange(now);

  // One `assessment` ledger entry is posted per line item at generation time,
  // so this month's entries ARE what was billed this month. Summing the
  // assessment definitions instead (the previous code) read a $485 monthly
  // assessment as $485 for a 124-unit community.
  const { data: billedEntries, isLoading: billedLoading } = useLedger(communityId, {
    entryType: 'assessment',
    startDate,
    endDate,
    limit: LEDGER_ROW_CAP,
  });
  // Every paid row, uncapped (payment history is not paginated). Shares the
  // Recent Payments tab's query, so it costs no extra request once that tab
  // has loaded.
  const { data: payments, isLoading: paymentsLoading } = useRecentPayments(communityId);
  const { data: delinquent, isLoading: delinquentLoading } = useDelinquency(communityId, {
    enabled: delinquencyEnabled,
  });

  const billedCents = billedEntries?.reduce((sum, entry) => sum + entry.amountCents, 0) ?? 0;

  // Late fee included: it settles with the line item it attaches to. A paid
  // row with no paidAt cannot be placed in a month and is left out.
  const collectedCents =
    payments?.reduce(
      (sum, payment) =>
        payment.paidAt && isInSameMonth(payment.paidAt, now)
          ? sum + payment.amountCents + payment.lateFeeCents
          : sum,
      0,
    ) ?? 0;

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
        title="Billed This Month"
        value={formatCents(billedCents)}
        icon={DollarSign}
        isLoading={billedLoading}
      />
      <KpiCard
        title="Collected This Month"
        value={formatCents(collectedCents)}
        icon={CheckCircle}
        isLoading={paymentsLoading}
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
