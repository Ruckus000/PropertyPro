'use client';

/**
 * KpiGrid — the eight-card platform overview row (spec D25).
 *
 * Each card is a `KpiCard` rendered as a `<button>` (no `href`) that opens a
 * shared `KpiDetailDialog` with that card's series/breakdown. Only one
 * dialog is mounted at a time, keyed by which card was last clicked.
 */
import { useState } from 'react';
import { AlertTriangle, Bug, Building2, DollarSign, Inbox, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { KpiCard, type KpiCardProps } from '@propertypro/ui';
import type { PlatformDashboardStats } from '@/lib/server/dashboard';
import type { DashboardSeries, MonthPoint } from '@/lib/server/dashboard-series';
import type { ShellSignals } from '@/lib/server/shell-signals';
import { KpiDetailDialog, type KpiDetailBreakdownRow } from './KpiDetailDialog';

interface KpiGridProps {
  stats: PlatformDashboardStats;
  series: DashboardSeries;
  signals: ShellSignals;
}

interface KpiDefinition {
  key: string;
  title: string;
  value: string | number;
  delta?: number;
  /**
   * Caption naming the period `delta` actually measures. Explicit per-card
   * rather than relying on `KpiCard`'s "vs last 30 days" default — MRR's
   * delta is day-over-day (`mrr_delta_pct` off the latest daily snapshot)
   * and Past due's is month-over-month (`seriesDeltaPct` over the monthly
   * `pastDue` bucket), and a caption that misstates its period is worse than
   * none. Passed through to both the compact card and the detail dialog so
   * the two surfaces never disagree.
   */
  deltaLabel?: string;
  trend?: KpiCardProps['trend'];
  invertTrend?: boolean;
  icon: KpiCardProps['icon'];
  series?: MonthPoint[];
  description: string;
  ctaHref: string;
  ctaLabel: string;
  breakdown?: KpiDetailBreakdownRow[];
}

/**
 * Percent growth over the trailing 30 days, from a total and the count of
 * rows new to that window. Undefined (renders no delta) when there's nothing
 * to compare against — a metric with no prior total.
 */
function growthPct(total: number, newInWindow: number): number | undefined {
  const priorTotal = total - newInWindow;
  if (priorTotal <= 0) return undefined;
  return Math.round((newInWindow / priorTotal) * 100);
}

/**
 * Percent change between a series' last two monthly points. `latestOverride`
 * substitutes the true current value for the last point — the current,
 * still-open month's bucket is a real `0` until the daily cron writes that
 * day's snapshot (see `DashboardSeries.latestMrr` docblock), so comparing
 * against it produces a phantom swing. `??` (not `||`) so a genuine `0`
 * override is kept rather than falling through to the bucket.
 */
function seriesDeltaPct(points: MonthPoint[] | undefined, latestOverride?: number | null): number | undefined {
  if (!points || points.length < 2) return undefined;
  const previous = points[points.length - 2]!.value;
  const latest = latestOverride ?? points[points.length - 1]!.value;
  if (previous === 0) return undefined;
  return Math.round(((latest - previous) / previous) * 100);
}

function latestValue(points: MonthPoint[] | undefined): number {
  if (!points || points.length === 0) return 0;
  return points[points.length - 1]!.value;
}

/**
 * Derives a card's arrow/colour trend from the sign of its own delta —
 * never hardcode `trend`, or the card can state the opposite of what its
 * delta says (a revenue drop rendering as green growth). Mirrors
 * `deltaToTrend` in `apps/web/src/hooks/use-portfolio-dashboard.ts:94-97`.
 * `invertTrend` (e.g. Past due, where a falling count is good) is applied by
 * `KpiCard`/`KpiDetailDialog` themselves, not here — this only reports
 * direction.
 */
function deltaToTrend(delta: number | undefined): KpiCardProps['trend'] {
  if (delta === undefined || delta === 0) return 'neutral';
  return delta > 0 ? 'up' : 'down';
}

function formatCurrency(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function KpiGrid({ stats, series, signals }: KpiGridProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const billingBreakdown: KpiDetailBreakdownRow[] = [
    { label: 'Active', value: stats.billing.active },
    { label: 'Trialing', value: stats.billing.trialing },
    { label: 'Past due', value: stats.billing.past_due },
    { label: 'Canceled', value: stats.billing.canceled },
  ];

  const complianceBreakdown: KpiDetailBreakdownRow[] = [
    { label: '90% and up', value: stats.compliance.distribution.top },
    { label: '80–89%', value: stats.compliance.distribution.high },
    { label: '70–79%', value: stats.compliance.distribution.mid },
    { label: 'Below 70%', value: stats.compliance.distribution.low },
  ];

  const communitiesDelta = growthPct(stats.overview.communities, stats.deltas.communities30d);
  const membersDelta = growthPct(stats.overview.members, stats.deltas.members30d);
  // Day-over-day: `latestMrrDeltaPct` comes from `mrr_delta_pct` on the
  // single latest daily snapshot vs. the one before it, not a 30-day or
  // monthly comparison.
  const mrrDelta = series.latestMrrDeltaPct ?? undefined;
  // seriesDeltaPct compares the last two points of the monthly `pastDue`
  // bucket — a month-over-month change, not a 30-day one. `latestPastDue`
  // (the true current count, from the latest daily snapshot) substitutes
  // for the current, still-open month's phantom-zero bucket value, exactly
  // as `latestMrr` does for MRR — see `seriesDeltaPct`'s docblock.
  const pastDueDelta = seriesDeltaPct(series.pastDue, series.latestPastDue);

  const cards: KpiDefinition[] = [
    {
      key: 'communities',
      title: 'Communities',
      value: stats.overview.communities.toLocaleString(),
      delta: communitiesDelta,
      deltaLabel: 'vs last 30 days',
      trend: deltaToTrend(communitiesDelta),
      icon: Building2,
      series: series.communities,
      description: `${stats.deltas.communities30d} new in the last 30 days.`,
      ctaHref: '/clients',
      ctaLabel: 'View clients',
    },
    {
      key: 'members',
      title: 'Members',
      value: stats.overview.members.toLocaleString(),
      delta: membersDelta,
      deltaLabel: 'vs last 30 days',
      trend: deltaToTrend(membersDelta),
      icon: Users,
      series: series.members,
      description: `${stats.deltas.members30d} new in the last 30 days.`,
      ctaHref: '/clients',
      ctaLabel: 'View clients',
    },
    {
      key: 'mrr',
      title: 'MRR',
      // The real latest MRR, not `latestValue(series.mrr)` — that reads the
      // bucketed chart's current-month bar, which is `0` for every day of
      // the month until the daily cron writes a snapshot (see
      // `DashboardSeries.latestMrr` docblock). Falls back to the bucket only
      // when there is no snapshot at all (series.latestMrr undefined/null),
      // which also legitimately renders $0.
      value: formatCurrency(series.latestMrr ?? latestValue(series.mrr)),
      delta: mrrDelta,
      deltaLabel: 'vs yesterday',
      trend: deltaToTrend(mrrDelta),
      icon: DollarSign,
      series: series.mrr,
      description: 'Monthly recurring revenue, from the latest snapshot.',
      ctaHref: '/billing',
      ctaLabel: 'Open billing',
      breakdown: billingBreakdown,
    },
    {
      key: 'compliance',
      title: 'Avg. compliance',
      value: stats.compliance.averageScore !== null ? `${stats.compliance.averageScore}%` : '—',
      icon: ShieldCheck,
      description: `${stats.compliance.totalTracked} communities tracked, ${stats.compliance.atRiskCount} at risk.`,
      ctaHref: '/clients',
      ctaLabel: 'View clients',
      breakdown: complianceBreakdown,
    },
    {
      key: 'trials',
      title: 'Active trials',
      value: stats.billing.trialing,
      icon: TrendingUp,
      description: 'Communities currently on a trial subscription.',
      ctaHref: '/billing',
      ctaLabel: 'Open billing',
      breakdown: billingBreakdown,
    },
    {
      key: 'past_due',
      title: 'Past due',
      value: stats.billing.past_due,
      delta: pastDueDelta,
      // seriesDeltaPct compares the last two points of the monthly `pastDue`
      // bucket — a month-over-month change, not a 30-day one.
      deltaLabel: 'vs last month',
      trend: deltaToTrend(pastDueDelta),
      invertTrend: true,
      icon: AlertTriangle,
      series: series.pastDue,
      description: 'Subscriptions with a failed or missed payment.',
      ctaHref: '/billing?status=past_due',
      ctaLabel: 'Open billing',
      breakdown: billingBreakdown,
    },
    {
      key: 'threads',
      title: 'Open threads',
      value: signals.counts.inbox,
      icon: Inbox,
      description: 'Support threads waiting on a reply.',
      ctaHref: '/inbox',
      ctaLabel: 'Open inbox',
    },
    {
      key: 'failed_jobs',
      title: 'Failed jobs',
      value: signals.counts.health,
      icon: Bug,
      description: 'Background jobs that failed and need a look.',
      ctaHref: '/health',
      ctaLabel: 'Open health',
    },
  ];

  const active = cards.find((card) => card.key === openKey) ?? null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            title={card.title}
            value={card.value}
            delta={card.delta}
            deltaLabel={card.deltaLabel}
            trend={card.trend}
            invertTrend={card.invertTrend}
            icon={card.icon}
            onClick={() => setOpenKey(card.key)}
          />
        ))}
      </div>
      <KpiDetailDialog
        open={active !== null}
        onOpenChange={(open) => setOpenKey(open ? openKey : null)}
        title={active?.title ?? ''}
        value={active?.value ?? ''}
        deltaLabel={active?.deltaLabel}
        delta={active?.delta}
        invertTrend={active?.invertTrend}
        description={active?.description ?? ''}
        series={active?.series}
        breakdown={active?.breakdown}
        ctaHref={active?.ctaHref ?? '#'}
        ctaLabel={active?.ctaLabel ?? ''}
      />
    </>
  );
}
