import { beforeEach, describe, expect, it, vi } from 'vitest';

const orMock = vi.fn();
const eqMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'communities') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqMock(column, value);
            return {
              is: () => ({
                or: (filter: string) => {
                  orMock(filter);
                  return { limit: async () => ({ data: [], error: null }) };
                },
              }),
            };
          },
        }),
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

  it('excludes demo instances — a demo must not surface under "Clients" and then 404', async () => {
    // Every other site that means "real community" filters `is_demo`
    // (clients.ts, dashboard.ts, dashboard-series.ts, settings/page.tsx);
    // this searcher was the one place that didn't, so a demo appeared in
    // the ⌘K "Clients" group, was absent from the portfolio grid, and its
    // workspace Compliance tab 404'd "Community not found".
    await communitySearcher.search('sunset' as SanitizedTerm, 5);

    expect(eqMock).toHaveBeenCalledWith('is_demo', false);
  });
});
