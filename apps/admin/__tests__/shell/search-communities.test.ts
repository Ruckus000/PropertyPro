import { beforeEach, describe, expect, it, vi } from 'vitest';

const orMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'communities') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          is: () => ({
            or: (filter: string) => {
              orMock(filter);
              return { limit: async () => ({ data: [], error: null }) };
            },
          }),
        }),
      };
    },
  }),
}));

import { communitySearcher } from '@/lib/server/search/communities';

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
  });

  it('builds the ilike filter directly from the given term, trusting it is already sanitized', async () => {
    await communitySearcher.search('john_doe', 5);

    expect(orMock).toHaveBeenCalledTimes(1);
    expect(orMock.mock.calls[0]![0]).toBe('name.ilike.%john_doe%,slug.ilike.%john_doe%');
  });
});
