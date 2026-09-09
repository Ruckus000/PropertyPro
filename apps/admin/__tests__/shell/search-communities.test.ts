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

// Proves the shared sanitizeSearchTerm() is actually wired into the ilike
// filter this searcher builds — not just defined and unused. The pure-function
// behavior is covered directly in search-sanitize.test.ts; this is the
// integration point where an un-sanitized term would have widened a real
// Postgres query.
describe('communitySearcher', () => {
  beforeEach(() => {
    orMock.mockReset();
  });

  it('strips the ILIKE single-character wildcard out of the filter it sends to Postgres', async () => {
    await communitySearcher.search('john_doe', 5);

    expect(orMock).toHaveBeenCalledTimes(1);
    const filter = orMock.mock.calls[0]![0] as string;
    expect(filter).not.toContain('_');
    expect(filter).toBe('name.ilike.%john doe%,slug.ilike.%john doe%');
  });
});
