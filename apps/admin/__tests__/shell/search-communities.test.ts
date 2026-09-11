import { beforeEach, describe, expect, it, vi } from 'vitest';

const orMock = vi.fn();
const eqMock = vi.fn();
const isMock = vi.fn();
const selectMock = vi.fn();

let rows: Array<{
  id: number;
  name: string;
  slug: string;
  community_type: string;
  is_demo: boolean;
}> = [];

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'communities') throw new Error(`Unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          selectMock(columns);
          // `eq` is still exposed so that a reintroduced `.eq('is_demo', false)`
          // would RECORD rather than throw — a mock that breaks on the extra
          // call would fail for the wrong reason and hide which filter changed.
          const chain = {
            eq: (column: string, value: unknown) => {
              eqMock(column, value);
              return chain;
            },
            is: (column: string, value: unknown) => {
              isMock(column, value);
              return chain;
            },
            or: (filter: string) => {
              orMock(filter);
              return { limit: async () => ({ data: rows, error: null }) };
            },
          };
          return chain;
        },
      };
    },
  }),
}));

import { communitySearcher } from '@/lib/server/search/communities';
import type { SanitizedTerm } from '@/lib/server/search/sanitize';

// Sanitization is `searchAdmin`'s job now (`../../src/lib/server/search.ts`),
// not each searcher's — see `Searcher.search`'s docblock. This proves
// `communitySearcher` builds its ilike filter DIRECTLY from the term it is
// given, with no re-sanitization: passing a raw, unstripped underscore
// through unchanged is what would break if a re-sanitize call crept back in.
// The sanitizer's own behavior is covered in search-sanitize.test.ts; that
// `searchAdmin` actually calls it before invoking any searcher is covered in
// search.test.ts.
describe('communitySearcher', () => {
  beforeEach(() => {
    orMock.mockReset();
    eqMock.mockReset();
    isMock.mockReset();
    selectMock.mockReset();
    rows = [];
  });

  it('builds the ilike filter directly from the given term, trusting it is already sanitized', async () => {
    // The cast is the point of the test, not a workaround: `search` now
    // requires a `SanitizedTerm`, so handing it a term that still contains an
    // underscore has to be stated explicitly. That is exactly the scenario
    // being pinned — the searcher must pass through whatever it is given.
    await communitySearcher.search('john_doe' as SanitizedTerm, 5);

    expect(orMock).toHaveBeenCalledTimes(1);
    expect(orMock.mock.calls[0]![0]).toBe('name.ilike.%john_doe%,slug.ilike.%john_doe%');
  });

  it('excludes soft-deleted communities — that destination really does 404', async () => {
    await communitySearcher.search('sunset' as SanitizedTerm, 5);

    expect(isMock).toHaveBeenCalledWith('deleted_at', null);
  });

  /**
   * The regression this pins, in the direction it actually failed.
   *
   * A previous revision filtered `.eq('is_demo', false)` here. `seed:demo` marks
   * all three seeded communities `isDemo: true`, so that left the ⌘K "Clients"
   * group permanently empty in CI and on every developer machine, and broke
   * `admin-shell.spec.ts`'s "⌘K finds a seeded community". There is no demo
   * searcher, so exclusion made demo communities unreachable by search at all,
   * while their workspace page renders perfectly well.
   */
  it('includes demo communities rather than hiding them, and labels them', async () => {
    rows = [
      { id: 1, name: 'Sunset Condos', slug: 'sunset-condos', community_type: 'condo_718', is_demo: true },
      { id: 2, name: 'Real Client HOA', slug: 'real-client', community_type: 'hoa_720', is_demo: false },
    ];

    const hits = await communitySearcher.search('s' as SanitizedTerm, 5);

    // Both reachable — the demo is not filtered out of the query…
    expect(hits.map((h) => h.label)).toEqual(['Sunset Condos', 'Real Client HOA']);
    expect(hits.map((h) => h.href)).toEqual(['/clients/1', '/clients/2']);
    // …and `is_demo` is not used as a predicate at all.
    expect(eqMock).not.toHaveBeenCalledWith('is_demo', expect.anything());

    // …but the operator can tell them apart, which is the real concern the
    // exclusion was reaching for.
    expect(hits[0]!.meta).toBe('Demo · Condo §718');
    expect(hits[1]!.meta).not.toContain('Demo');
  });

  it('selects is_demo, without which the label cannot be rendered', async () => {
    await communitySearcher.search('s' as SanitizedTerm, 5);

    expect(selectMock.mock.calls[0]![0]).toContain('is_demo');
  });
});
