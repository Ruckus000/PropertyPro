/**
 * RevenueCard — latest MRR, day-over-day delta, a 12-month sparkline, ARR,
 * and a 30-day net-new figure. The headline MRR/ARR/net-new figures read
 * `series.latestMrr`/`series.mrr30dAgo` (the real latest daily snapshot, and
 * the snapshot nearest 30 days before it) rather than the bucketed monthly
 * `series.mrr` — that series fills the current, still-open calendar month
 * with `0` until the daily cron runs, and its last two points are a
 * calendar-month comparison, not a 30-day one. `series.mrr` still backs the
 * sparkline, where a `0` bar for an empty month is a defensible chart
 * choice.
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
  // Real latest MRR from the daily snapshot, not the bucketed chart's
  // current-month bar (which is `0` until the daily cron writes today's
  // snapshot — see the module docblock). Falls back to the chart's last
  // point only when there is no snapshot at all.
  const latest = series.latestMrr ?? (points.length > 0 ? points[points.length - 1]!.value : 0);
  const mrr30dAgo = series.mrr30dAgo ?? null;
  const netNew30d = mrr30dAgo !== null ? latest - mrr30dAgo : null;
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
