/**
 * Dashboard trend series — monthly-bucketed history behind the KPI grid's
 * mini charts and the Revenue card.
 *
 * The two bucketing helpers are pure (no DB access) so they're unit-tested
 * directly; `getDashboardSeries` is the one function that reads Supabase.
 *
 * @module lib/server/dashboard-series
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

export interface MonthPoint {
  /** 'YYYY-MM', UTC calendar month. */
  month: string;
  value: number;
}

export interface DashboardSeries {
  mrr: MonthPoint[];
  pastDue: MonthPoint[];
  communities: MonthPoint[];
  members: MonthPoint[];
  /**
   * Latest `revenue_snapshots.mrr_delta_pct`, coerced from Postgres `numeric`
   * to a number. `numeric` is serialized as a STRING by both drizzle and
   * PostgREST (precision safety), so an un-coerced value formats as `"12.50"`
   * and compares as a string — see the task brief's warning on this column.
   * `null` when there is no snapshot yet, the column itself is null, or the
   * stored value doesn't coerce to a finite number (a malformed value must
   * not render as a literal `NaN%`).
   *
   * Not part of the interface the task brief sketched for `DashboardSeries`
   * (`{ mrr; pastDue; communities; members }`) — added because both the KPI
   * grid's MRR card and `RevenueCard` need the raw snapshot delta (not a
   * month-over-month value derived from the bucketed `mrr` series, which
   * would mean something different), and this function already reads
   * `revenue_snapshots` for the bucketed series. A second read would
   * duplicate that query. Kept optional so a caller building a `series`
   * fixture without it (e.g. `kpi-grid.test.tsx`) still satisfies the type.
   */
  latestMrrDeltaPct?: number | null;
  /**
   * The true current MRR (dollars), from the most recent
   * `revenue_snapshots` row — NOT `mrr.at(-1)`. The bucketed `mrr` series
   * fills the current, still-open calendar month with `value: 0` until the
   * daily cron writes today's snapshot, so from UTC midnight on the 1st
   * until that cron runs, `mrr.at(-1)` reads as a real zero rather than
   * "no snapshot yet". Headline consumers (KPI grid MRR card, RevenueCard's
   * MRR/ARR/net-new) must read this field instead; `bucketByMonth` itself is
   * unchanged because a zero chart bar for an empty month is still the right
   * chart. `null` only when there is no snapshot at all. Optional for the
   * same fixture-compatibility reason as `latestMrrDeltaPct`.
   */
  latestMrr?: number | null;
  /**
   * MRR (dollars) from the daily snapshot nearest 30 days before the latest
   * one, for an actual 30-day "Net new" comparison — the bucketed `mrr`
   * series is monthly, so comparing its last two points swings between
   * ~1 day and ~2 months of real elapsed time depending on where in the
   * calendar `now` falls. `null` when there is no snapshot at least one day
   * older than the latest to compare against. Optional for the same
   * fixture-compatibility reason as `latestMrrDeltaPct`.
   */
  mrr30dAgo?: number | null;
}

interface AtValueRow {
  at: string;
  value: number;
}

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last N calendar months ending at `now`'s month, oldest first, as UTC month-start Dates. */
function monthStarts(months: number, now: Date): Date[] {
  const starts: Date[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    starts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  }
  return starts;
}

/**
 * Buckets point-in-time rows (e.g. daily revenue snapshots) into the last N
 * calendar months, keeping the LAST value per month by timestamp — these are
 * snapshots, not deltas, so the most recent one each month is the month's
 * value. Months with no rows get `value: 0`. Exported for
 * `dashboard-series.test.ts`.
 */
export function bucketByMonth(rows: AtValueRow[], months = 12, now: Date = new Date()): MonthPoint[] {
  const sorted = [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return monthStarts(months, now).map((start) => {
    const inMonth = sorted.filter((row) => {
      const at = new Date(row.at);
      return at.getUTCFullYear() === start.getUTCFullYear() && at.getUTCMonth() === start.getUTCMonth();
    });
    return {
      month: monthKeyOf(start),
      value: inMonth.length > 0 ? inMonth[inMonth.length - 1]!.value : 0,
    };
  });
}

/**
 * Running count of `createdAts` through the end of each of the last N
 * calendar months — the current, still-open month counts everything so far.
 * Exported for `dashboard-series.test.ts`.
 */
export function cumulativeByMonth(createdAts: string[], months = 12, now: Date = new Date()): MonthPoint[] {
  const times = createdAts.map((iso) => new Date(iso).getTime()).sort((a, b) => a - b);
  return monthStarts(months, now).map((start) => {
    const nextMonthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    return {
      month: monthKeyOf(start),
      value: times.filter((t) => t < nextMonthStart).length,
    };
  });
}

interface RevenueSnapshotRow {
  computed_at: string;
  mrr_cents: number | string;
  past_due_subscriptions: number | string;
  mrr_delta_pct: number | string | null;
}

interface CreatedAtRow {
  created_at: string;
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

const SERIES_MONTHS = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NET_NEW_WINDOW_DAYS = 30;

/** Coerces to a number, falling back to `null` for anything non-finite (incl. `NaN`, `null`, `undefined`). */
function toFiniteNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Among `candidates` (assumed to exclude the latest snapshot itself), the
 * row whose `computed_at` is closest to `targetMs`. `null` if `candidates`
 * is empty — there is nothing to compare against.
 */
function nearestSnapshotTo(candidates: RevenueSnapshotRow[], targetMs: number): RevenueSnapshotRow | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, row) => {
    const rowDiff = Math.abs(new Date(row.computed_at).getTime() - targetMs);
    const closestDiff = Math.abs(new Date(closest.computed_at).getTime() - targetMs);
    return rowDiff < closestDiff ? row : closest;
  });
}

export async function getDashboardSeries(): Promise<DashboardSeries> {
  const db = createAdminClient();
  const now = new Date();
  // One extra month of headroom so a snapshot landing right at a month
  // boundary is never dropped by the cutoff before bucketing trims it back
  // down to SERIES_MONTHS.
  const cutoffIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SERIES_MONTHS, 1)).toISOString();

  const [snapshotsResult, communitiesResult, membersResult] = await Promise.all([
    db
      .from('revenue_snapshots')
      .select('computed_at, mrr_cents, past_due_subscriptions, mrr_delta_pct')
      .gte('computed_at', cutoffIso)
      .order('computed_at', { ascending: true }),
    db.from('communities').select('created_at').eq('is_demo', false).is('deleted_at', null),
    db.from('user_roles').select('created_at'),
  ]);

  throwIfError(snapshotsResult.error, 'Failed to load revenue snapshots');
  throwIfError(communitiesResult.error, 'Failed to load community creation history');
  throwIfError(membersResult.error, 'Failed to load member creation history');

  const snapshots = (snapshotsResult.data ?? []) as RevenueSnapshotRow[];

  const mrr = bucketByMonth(
    snapshots.map((row) => ({ at: row.computed_at, value: Number(row.mrr_cents ?? 0) / 100 })),
    SERIES_MONTHS,
    now,
  );
  const pastDue = bucketByMonth(
    snapshots.map((row) => ({ at: row.computed_at, value: Number(row.past_due_subscriptions ?? 0) })),
    SERIES_MONTHS,
    now,
  );
  const communities = cumulativeByMonth(
    ((communitiesResult.data ?? []) as CreatedAtRow[]).map((row) => row.created_at),
    SERIES_MONTHS,
    now,
  );
  const members = cumulativeByMonth(
    ((membersResult.data ?? []) as CreatedAtRow[]).map((row) => row.created_at),
    SERIES_MONTHS,
    now,
  );

  const latestSnapshot = snapshots.at(-1) ?? null;
  const latestMrrDeltaPct =
    latestSnapshot === null || latestSnapshot.mrr_delta_pct === null
      ? null
      : toFiniteNumberOrNull(latestSnapshot.mrr_delta_pct);
  const latestMrr = latestSnapshot === null ? null : Number(latestSnapshot.mrr_cents ?? 0) / 100;

  // `snapshots` is sorted ascending (query orders by computed_at asc), so
  // everything before the last element predates latestSnapshot.
  const priorSnapshots = snapshots.slice(0, -1);
  const mrr30dAgo =
    latestSnapshot === null
      ? null
      : (() => {
          const targetMs = new Date(latestSnapshot.computed_at).getTime() - NET_NEW_WINDOW_DAYS * MS_PER_DAY;
          const nearest = nearestSnapshotTo(priorSnapshots, targetMs);
          return nearest === null ? null : Number(nearest.mrr_cents ?? 0) / 100;
        })();

  return { mrr, pastDue, communities, members, latestMrrDeltaPct, latestMrr, mrr30dAgo };
}
