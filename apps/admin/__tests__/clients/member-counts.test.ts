import { describe, expect, it, vi } from 'vitest';

// `lib/server/clients.ts` also imports `findRootlessCommunities` from
// `@propertypro/db/unsafe`, which loads drizzle.ts and throws eagerly at
// MODULE LOAD if `DATABASE_URL` is unset — true in this test environment.
// `fetchMemberCounts` itself never touches that import, so a stub is enough.
vi.mock('@propertypro/db/unsafe', () => ({
  findRootlessCommunities: vi.fn().mockResolvedValue([]),
}));

import { fetchMemberCounts } from '@/lib/server/clients';

/**
 * Regression coverage for Task 15 fix-1 finding #2: `user_roles` holds one
 * row PER MEMBER PER COMMUNITY, so the old single-query `.limit(1000)` read
 * bounded member ROWS across every community at once, with no `ORDER BY` —
 * any community's count could be silently under-reported, and nothing marked
 * it approximate. `fetchMemberCounts` now pages with `.range()` until the
 * table is exhausted (an EXACT count in the common case), and only falls
 * back to `exact: false` if a safety-valve row bound is hit — see the
 * docblock on `fetchMemberCounts` in `lib/server/clients.ts`.
 */

interface FakeRow {
  community_id: number;
}

/** Minimal chainable stub for `.from('user_roles').select().in().range()`. */
function makeUserRolesDb(rows: FakeRow[]) {
  return {
    from: (table: string) => {
      if (table !== 'user_roles') {
        throw new Error(`member-counts.test.ts: unexpected table "${table}"`);
      }
      let scopedIds: number[] = [];
      const chain = {
        select: () => chain,
        in: (_col: string, ids: number[]) => {
          scopedIds = ids;
          return chain;
        },
        range: (from: number, to: number) => {
          const scoped = rows.filter((r) => scopedIds.includes(r.community_id));
          return Promise.resolve({ data: scoped.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
}

describe('fetchMemberCounts', () => {
  it('returns an empty, exact result for zero community ids without querying', () => {
    const db = makeUserRolesDb([]);
    return fetchMemberCounts(db as never, []).then((result) => {
      expect(result.exact).toBe(true);
      expect(result.counts.size).toBe(0);
    });
  });

  it('pages past the old 1000-row cap and still counts every member row exactly', async () => {
    // 1,500 member rows split across two communities — more than the OLD
    // single-query `.limit(1000)` cap could ever have counted in one page.
    const rows: FakeRow[] = [
      ...Array.from({ length: 750 }, () => ({ community_id: 1 })),
      ...Array.from({ length: 750 }, () => ({ community_id: 2 })),
    ];
    const db = makeUserRolesDb(rows);

    const result = await fetchMemberCounts(db as never, [1, 2]);

    expect(result.exact).toBe(true);
    expect(result.counts.get(1)).toBe(750);
    expect(result.counts.get(2)).toBe(750);
    // The two counts together exceed the old cap — proof the fix is not
    // just "paging that still tops out at 1000".
    expect((result.counts.get(1) ?? 0) + (result.counts.get(2) ?? 0)).toBe(1500);
  });

  it('gives up on exactness — rather than reporting a wrong number — once the row-bound safety valve is hit', async () => {
    // Far more rows than any plausible safety valve; every page comes back
    // full, so the loop can only stop by hitting the bound, never by a short
    // final page.
    const rows: FakeRow[] = Array.from({ length: 50_000 }, () => ({ community_id: 9 }));
    const db = makeUserRolesDb(rows);

    const result = await fetchMemberCounts(db as never, [9]);

    expect(result.exact).toBe(false);
  });
});
