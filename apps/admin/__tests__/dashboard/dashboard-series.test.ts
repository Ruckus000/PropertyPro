import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({ createAdminClientMock: vi.fn() }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import { bucketByMonth, cumulativeByMonth, getDashboardSeries } from '@/lib/server/dashboard-series';
import { COMMUNITY_SCAN_PAGE_SIZE } from '@/lib/api/list-limits';

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

interface CommunityFixture {
  id: number;
  created_at: string;
}

interface MemberRowFixture {
  community_id: number;
  created_at: string;
}

/**
 * Page-aware stub for `.from('user_roles').select('created_at').in('community_id', ids).range(from, to)`
 * — the shape `fetchRowsInPages` (extracted from `fetchMemberCounts`) actually
 * calls. Filtering by `.in()` here mirrors what Postgres would do, so a real
 * community id passed through wins even if the fixture also contains rows for
 * ids that aren't. `scopedIds` starts `null` — meaning "no `.in()` call seen
 * yet" — and only `.range()` without a preceding `.in()` returns the FULL,
 * unfiltered fixture, same as a real Postgrest query with no `.in()` in its
 * chain; this matters for the revert-check below, which drops the `.in()`
 * call and needs the stub to fail open (unfiltered) the way Postgres would,
 * not fail closed (empty). `.range()` slices the (filtered or unfiltered) set
 * page by page rather than returning the same page forever, so a fixture
 * bigger than one page actually exercises the loop.
 */
function makeUserRolesChain(rows: MemberRowFixture[]) {
  let scopedIds: number[] | null = null;
  const chain = {
    select: () => chain,
    in: (_col: string, ids: number[]) => {
      scopedIds = ids;
      return chain;
    },
    range: (from: number, to: number) => {
      const scoped = scopedIds === null ? rows : rows.filter((r) => scopedIds!.includes(r.community_id));
      return Promise.resolve({ data: scoped.slice(from, to + 1), error: null });
    },
  };
  return chain;
}

/**
 * Page-aware stub for the `communities` read, i.e.
 * `.select('id, created_at').eq('is_demo', false).is('deleted_at', null).order('id').range(from, to)`.
 *
 * `.range()` slices page by page, so a fixture larger than one page actually
 * exercises the paging loop. The thenable fallback — what an UNPAGED
 * `.select()…` resolves to, which is what this read used to be — deliberately
 * emulates PostgREST's `db-max-rows`: it caps at `COMMUNITY_SCAN_PAGE_SIZE`
 * rows with NO error, exactly as Supabase does. That is what makes the
 * revert-check below fail for the real reason (1000 of 1001 communities,
 * silently) rather than for a missing stub method.
 */
function makeCommunitiesChain(rows: CommunityFixture[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    range: (from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    then: (resolve: (v: { data: CommunityFixture[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(0, COMMUNITY_SCAN_PAGE_SIZE), error: null }).then(resolve, reject),
  };
  return chain;
}

function mockDashboardSeriesDb(opts: {
  snapshots?: SnapshotFixture[];
  communities?: CommunityFixture[];
  memberRows?: MemberRowFixture[];
}) {
  const snapshots = opts.snapshots ?? [];
  const communities = opts.communities ?? [];
  const memberRows = opts.memberRows ?? [];
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
      if (table === 'communities') {
        return makeCommunitiesChain(communities);
      }
      if (table === 'user_roles') {
        return makeUserRolesChain(memberRows);
      }
      throw new Error(`dashboard-series.test.ts: unexpected table "${table}"`);
    },
  });
}

function mockSnapshots(snapshots: SnapshotFixture[]) {
  mockDashboardSeriesDb({ snapshots });
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

  it('reads latestPastDue from the newest snapshot, not the zero current-month chart bucket — same defect shape as latestMrr', async () => {
    // Same scenario as the latestMrr test above, applied to Past due: a
    // snapshot on the last day of a month, `now` just after the month
    // rolled over, before the day's cron has written a new snapshot row.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:05:00Z'));

    mockSnapshots([
      { computed_at: '2026-08-30T04:00:00Z', mrr_cents: 1_760_000, past_due_subscriptions: 3 },
      { computed_at: '2026-08-31T04:00:00Z', mrr_cents: 1_864_000, past_due_subscriptions: 4 },
    ]);

    const series = await getDashboardSeries();

    // The fix: the real latest past-due count is exposed directly.
    expect(series.latestPastDue).toBe(4);
    // Unchanged: bucketByMonth still renders a 0 bar for the still-open
    // month — that's the chart's defensible behavior, not the bug.
    expect(series.pastDue.at(-1)).toEqual({ month: '2026-09', value: 0 });
    expect(series.pastDue.at(-2)).toEqual({ month: '2026-08', value: 4 });
  });

  it('latestPastDue is null when there are no snapshots at all', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    mockSnapshots([]);

    const series = await getDashboardSeries();

    expect(series.latestPastDue).toBeNull();
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

  /**
   * Regression coverage for the members-KPI/chart divergence: the headline
   * (`dashboard.ts`'s `stats.overview.members`) is scoped to real (non-demo,
   * non-deleted) communities, but the series used to read `user_roles` with
   * no filter at all — so the chart's last point counted demo-community
   * members the headline excluded and could never match it.
   */
  it('scopes the members series to real communities, matching the headline — a demo-community member must not appear', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const memberRows = [
      { community_id: 1, created_at: '2026-08-15T00:00:00Z' }, // real community
      { community_id: 2, created_at: '2026-08-20T00:00:00Z' }, // demo community — must be excluded
    ];

    mockDashboardSeriesDb({
      // Only the real community comes back from the (already-filtered)
      // `communities` query — id 2 (demo) never reaches the series function
      // at all, exactly as `dashboard.ts`'s headline query behaves.
      communities: [{ id: 1, created_at: '2026-01-01T00:00:00Z' }],
      memberRows,
    });

    const series = await getDashboardSeries();

    // Scoped: only the real-community member is counted.
    expect(series.members.at(-1)!.value).toBe(1);

    // Proof this isn't a fixture-shape accident: an UNFILTERED read of the
    // very same rows — what the pre-fix query did — would have counted both.
    const unfiltered = cumulativeByMonth(memberRows.map((r) => r.created_at), 12, now);
    expect(unfiltered.at(-1)!.value).toBe(2);
  });
  it('pages past PostgREST\'s 1000-row cap — the 1001st community is counted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // One row past a single page. An unpaged `.select()` would come back with
    // exactly COMMUNITY_SCAN_PAGE_SIZE rows and no error, so the chart would
    // report 1000 communities as fact and the members scan would be restricted
    // to those 1000 ids — which is also how this set could stop matching
    // `dashboard.ts`'s headline set, the divergence `guard:admin-community-scope`
    // exists for.
    const total = COMMUNITY_SCAN_PAGE_SIZE + 1;
    const communities = Array.from({ length: total }, (_, i) => ({
      id: i + 1,
      created_at: '2026-01-01T00:00:00Z',
    }));

    mockDashboardSeriesDb({
      communities,
      // The 1001st community's member only shows up if that community's id
      // reached the members scan, i.e. only if the second page was fetched.
      memberRows: [{ community_id: total, created_at: '2026-08-15T00:00:00Z' }],
    });

    const series = await getDashboardSeries();

    expect(series.communities.at(-1)!.value).toBe(total);
    expect(series.members.at(-1)!.value).toBe(1);
  });
});
