/**
 * RevenueCard — latest MRR, day-over-day delta, a 12-month sparkline, ARR,
 * and a 30-day net-new figure derived from the bucketed monthly series.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSeries } from '@/lib/server/dashboard-series';
import { MiniBars } from './MiniBars';

interface RevenueCardProps {
  series: DashboardSeries;
}

function formatCurrency(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function formatSignedCurrency(dollars: number): string {
  return `${dollars >= 0 ? '+' : ''}${formatCurrency(dollars)}`;
}

export function RevenueCard({ series }: RevenueCardProps) {
  const points = series.mrr;
  const latest = points.length > 0 ? points[points.length - 1]!.value : 0;
  const previous = points.length > 1 ? points[points.length - 2]!.value : null;
  const netNew30d = previous !== null ? latest - previous : null;
  const arr = latest * 12;
  const deltaPct = series.latestMrrDeltaPct ?? null;

  return (
    <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content-secondary">Revenue</h2>
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-xs font-medium text-interactive hover:underline"
        >
          Open billing
          <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      </div>

      <div className="mb-4 flex items-end gap-3">
        <p className="text-3xl font-semibold text-content">{formatCurrency(latest)}</p>
        {deltaPct !== null && (
          <p className={cn('pb-1 text-sm font-medium', deltaPct < 0 ? 'text-status-danger' : 'text-status-success')}>
            {deltaPct > 0 ? '+' : ''}
            {deltaPct}%
          </p>
        )}
      </div>

      <MiniBars data={points} />

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-edge pt-4 text-sm">
        <div>
          <dt className="text-content-tertiary">ARR</dt>
          <dd className="font-medium text-content">{formatCurrency(arr)}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Net new (30d)</dt>
          <dd
            className={cn(
              'font-medium',
              netNew30d !== null && netNew30d < 0 ? 'text-status-danger' : 'text-content',
            )}
          >
            {netNew30d === null ? '—' : formatSignedCurrency(netNew30d)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
