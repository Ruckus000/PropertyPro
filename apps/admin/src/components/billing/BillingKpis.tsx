'use client';

/**
 * The four headline numbers on `/billing`, plus a twelve-month MRR sparkline.
 *
 * ## Every number arriving here is in CENTS
 *
 * `BillingOverview` denominates all of its money in cents — `mrrCents`,
 * `pastDueCents` and, unusually, `series` too, so that one interface has one
 * unit. `lib/server/dashboard-series.ts` exposes the SAME
 * `revenue_snapshots.mrr_cents` column in DOLLARS, and the dashboard's KPI grid
 * formats dollars. Mixing them renders a hundredfold-wrong number that still
 * looks like money, so the conversion is not written inline here: it goes
 * through `lib/billing/format`, whose function names carry the unit.
 *
 * ## Trends are derived, never assumed
 *
 * Wave 2 shipped a KPI grid where all four cards hardcoded an upward trend, so
 * every metric read as "improving" whichever way it had moved. Only MRR has a
 * delta to show — `mrrDeltaPct`, the day-over-day change from the latest
 * `revenue_snapshots` row — and its direction comes from the sign of that
 * value. The other three cards render NO delta rather than a decorative one;
 * `BillingOverview` exposes no history for past due, trials or coupons, and a
 * made-up arrow on a money screen is worse than a missing one.
 *
 * Past due still declares `invertTrend`, because the day a past-due delta does
 * exist, a RISE in money we are failing to collect must read as bad. Setting it
 * at the call site is the only place that decision can live.
 */
import { AlertTriangle, DollarSign, Hourglass, Percent } from 'lucide-react';
import { KpiCard, type KpiCardProps } from '@propertypro/ui';
import type { BillingOverview } from '@/lib/server/billing';
import type { MonthPoint } from '@/lib/server/dashboard-series';
import { MiniBars } from '@/components/dashboard/MiniBars';
import { centsToDollars, formatCentsAsCurrency } from '@/lib/billing/format';

interface BillingKpisProps {
  kpis: BillingOverview['kpis'];
  /** MRR history, in CENTS — see the module docblock. */
  series: MonthPoint[];
}

/**
 * Delta sign → arrow direction only. Whether that direction is GOOD is
 * `invertTrend`'s job, on the card. Mirrors `dashboard/KpiGrid.tsx`.
 */
function deltaToTrend(delta: number | null): KpiCardProps['trend'] {
  if (delta === null || delta === 0) return 'neutral';
  return delta > 0 ? 'up' : 'down';
}

export function BillingKpis({ kpis, series }: BillingKpisProps) {
  const mrrDelta = kpis.mrrDeltaPct;

  // Cents → dollars for display. `MiniBars` renders the raw value in its hover
  // title, so handing it cents would draw correct bars over labels off by 100x.
  const seriesInDollars = series.map((point) => ({
    month: point.month,
    value: centsToDollars(point.value),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="MRR"
          value={formatCentsAsCurrency(kpis.mrrCents)}
          delta={mrrDelta ?? undefined}
          deltaLabel="vs yesterday"
          trend={deltaToTrend(mrrDelta)}
          icon={DollarSign}
        />
        <KpiCard
          title="Past due"
          value={formatCentsAsCurrency(kpis.pastDueCents)}
          // No delta is available (see the docblock). `invertTrend` is declared
          // anyway so the semantics of this card can never be wrong: money we
          // are not collecting going UP is never good news.
          invertTrend
          icon={AlertTriangle}
        />
        <KpiCard title="Trials ending (14d)" value={kpis.trialsEnding14d} icon={Hourglass} />
        <KpiCard title="Coupons active" value={kpis.couponsActive} icon={Percent} />
      </div>

      <div className="rounded-md border border-edge bg-surface-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-tertiary">
          MRR, last 12 months
        </p>
        {/*
          `MiniBars` renders nothing when every point is zero — there is no
          scale to draw bars against. Say so rather than leaving a heading over
          an empty box: no snapshots yet and a genuinely flat zero look the
          same from here, and the daily `revenue_snapshots` cron is the usual
          reason for the first.
        */}
        {seriesInDollars.some((point) => point.value !== 0) ? (
          <MiniBars data={seriesInDollars} seriesLabel="the last 12 months" />
        ) : (
          <p className="text-sm text-content-tertiary">
            No revenue snapshots in this window yet.
          </p>
        )}
      </div>
    </div>
  );
}
