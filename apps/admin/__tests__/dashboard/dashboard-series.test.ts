import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({ createAdminClientMock: vi.fn() }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import { bucketByMonth, cumulativeByMonth, getDashboardSeries } from '@/lib/server/dashboard-series';

const now = new Date('2026-09-08T12:00:00Z');
describe('dashboard series', () => {
  it('bucketByMonth keeps the last value per month and fills 12 months', () => {
    const pts = bucketByMonth([{ at: '2026-08-01T02:00:00Z', value: 17200 }, { at: '2026-08-30T02:00:00Z', value: 17600 }, { at: '2026-09-07T02:00:00Z', value: 18640 }], 12, now);
    expect(pts).toHaveLength(12);
    expect(pts.at(-1)).toEqual({ month: '2026-09', value: 18640 });
    expect(pts.at(-2)).toEqual({ month: '2026-08', value: 17600 });
    expect(pts[0]!.month).toBe('2025-10');
    expect(pts[0]!.value).toBe(0);
  });
  it('cumulativeByMonth is a running count', () => {
    const pts = cumulativeByMonth(['2026-07-15T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-20T00:00:00Z'], 3, now);
    expect(pts.map((p) => p.value)).toEqual([1, 3, 3]);
  });
});

/**
 * Chainable Supabase-style query-result stub. Every method returns the same
 * chain object (so `.select().gte().order()`, `.select().eq().is()`, and a
 * bare `.select()` all work), and the chain itself is thenable so
 * `await db.from(...).select(...)` resolves the same way the real
 * postgrest-js builder does.
 */
function makeQueryResult(data: unknown, error: { message: string } | null = null) {
  const result = { data, error };
  const chain = {
    select: () => chain,
    gte: () => chain,
    order: () => chain,
    eq: () => chain,
    is: () => chain,
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

interface SnapshotFixture {
  computed_at: string;
  mrr_cents: number;
  past_due_subscriptions?: number;
  mrr_delta_pct?: string | number | null;
}

function mockSnapshots(snapshots: SnapshotFixture[]) {
  createAdminClientMock.mockReturnValue({
    from: (table: string) => {
      if (table === 'revenue_snapshots') {
        return makeQueryResult(
          snapshots.map((s) => ({
            computed_at: s.computed_at,
            mrr_cents: s.mrr_cents,
            past_due_subscriptions: s.past_due_subscriptions ?? 0,
            mrr_delta_pct: s.mrr_delta_pct ?? null,
          })),
        );
      }
      if (table === 'communities' || table === 'user_roles') {
        return makeQueryResult([]);
      }
      throw new Error(`dashboard-series.test.ts: unexpected table "${table}"`);
    },
  });
}

describe('getDashboardSeries', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads latestMrr from the newest snapshot, not the zero current-month chart bucket', async () => {
    // The exact scenario from the task brief: a snapshot on the LAST DAY of
    // a month, `now` on the 1ST of the next month, before that day's cron
    // has written a new snapshot. The chart bucket for the new month has no
    // rows yet, so bucketByMonth correctly fills it with 0 — but the real
    // latest MRR (Aug 31's snapshot) must still be $18,640, not $0.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:05:00Z'));

    mockSnapshots([
      { computed_at: '2026-08-30T04:00:00Z', mrr_cents: 1_760_000, mrr_delta_pct: '1.20' },
      { computed_at: '2026-08-31T04:00:00Z', mrr_cents: 1_864_000, mrr_delta_pct: '5.90' },
    ]);

    const series = await getDashboardSeries();

    // The fix: the real latest MRR is exposed directly.
    expect(series.latestMrr).toBe(18640);
    // Unchanged: bucketByMonth is still allowed to render a 0 bar for the
    // still-open month — that's the chart's defensible behavior, not the bug.
    expect(series.mrr.at(-1)).toEqual({ month: '2026-09', value: 0 });
    expect(series.mrr.at(-2)).toEqual({ month: '2026-08', value: 18640 });
  });

  it('mrr30dAgo picks the daily snapshot nearest 30 days before the latest one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    mockSnapshots([
      // latest is 2026-09-08. 30 days before is 2026-08-09.
      { computed_at: '2026-08-08T04:00:00Z', mrr_cents: 1_700_000 }, // 31 days before — diff 1 day
      { computed_at: '2026-08-11T04:00:00Z', mrr_cents: 1_720_000 }, // 28 days before — diff 2 days
      { computed_at: '2026-09-01T04:00:00Z', mrr_cents: 1_800_000 },
      { computed_at: '2026-09-08T04:00:00Z', mrr_cents: 1_900_000 },
    ]);

    const series = await getDashboardSeries();

    expect(series.latestMrr).toBe(19000);
    // 2026-08-08 (diff 1 day) is nearer to the 30-day-ago target than
    // 2026-08-11 (diff 2 days).
    expect(series.mrr30dAgo).toBe(17000);
  });

  it('mrr30dAgo is null when there is no earlier snapshot to compare against', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    mockSnapshots([{ computed_at: '2026-09-08T04:00:00Z', mrr_cents: 1_900_000 }]);

    const series = await getDashboardSeries();

    expect(series.latestMrr).toBe(19000);
    expect(series.mrr30dAgo).toBeNull();
  });

  it('latestMrrDeltaPct falls back to null instead of NaN for a malformed value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    mockSnapshots([{ computed_at: '2026-09-08T04:00:00Z', mrr_cents: 1_900_000, mrr_delta_pct: 'not-a-number' }]);

    const series = await getDashboardSeries();

    expect(series.latestMrrDeltaPct).toBeNull();
    expect(Number.isNaN(series.latestMrrDeltaPct as number)).toBe(false);
  });

  it('latestMrr and latestMrrDeltaPct are null when there are no snapshots at all', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    mockSnapshots([]);

    const series = await getDashboardSeries();

    expect(series.latestMrr).toBeNull();
    expect(series.mrr30dAgo).toBeNull();
    expect(series.latestMrrDeltaPct).toBeNull();
  });
});
