import { beforeEach, describe, expect, it, vi } from 'vitest';

const userOrMock = vi.fn();
const roleInMock = vi.fn();
const roleOrderMock = vi.fn();
const communityInMock = vi.fn();
const communityEqMock = vi.fn();
const communityIsMock = vi.fn();

let usersData: Array<{ id: string; email: string; full_name: string | null }> = [];
let rolesData: Array<{ user_id: string; community_id: number }> = [];
let rolesError: { message: string } | null = null;
// Full fixture rows for the `communities` table — the mock chain below
// actually applies `.in()`/`.eq()`/`.is()` as real filters over this array
// (unlike the `user_roles` mock, which returns a canned `rolesData` verbatim)
// so that removing a real filter from the production query changes which
// rows come back, the way it would against a real Postgres table. This is
// what lets the revert-check below actually redden for the stated reason.
let communitiesData: Array<{ id: number; is_demo: boolean; deleted_at: string | null }> = [];
let communitiesError: { message: string } | null = null;

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'users') throw new Error(`Unexpected typed table: ${table}`);
      return {
        select: () => ({
          is: () => ({
            or: (filter: string) => {
              userOrMock(filter);
              return { limit: async () => ({ data: usersData, error: null }) };
            },
          }),
        }),
      };
    },
  }),
  // Serves both `user_roles` (the membership lookup) and `communities` (the
  // real-community filter) — the searcher issues both through the same
  // untyped admin client.
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) => {
              roleInMock(ids);
              return {
                order: (col: string, opts: { ascending: boolean }) => {
                  roleOrderMock(col, opts);
                  return { data: rolesData, error: rolesError };
                },
              };
            },
          }),
        };
      }
      if (table === 'communities') {
        return {
          select: () => ({
            in: (_col: string, ids: number[]) => {
              communityInMock(ids);
              const afterIn = communitiesData.filter((c) => ids.includes(c.id));
              // Every stage below exposes `data`/`error` directly (in
              // addition to the next chain method) so the query resolves
              // correctly however many filters the production code actually
              // calls — including fewer than the full chain, which is what
              // the revert-check below exercises.
              return {
                data: afterIn,
                error: communitiesError,
                eq: (_col2: string, val: boolean) => {
                  communityEqMock(val);
                  const afterEq = afterIn.filter((c) => c.is_demo === val);
                  return {
                    data: afterEq,
                    error: communitiesError,
                    is: (_col3: string, val2: null) => {
                      communityIsMock(val2);
                      const afterIs = afterEq.filter((c) => c.deleted_at === val2);
                      return { data: afterIs, error: communitiesError };
                    },
                  };
                },
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected untyped table: ${table}`);
    },
  }),
}));

import { userSearcher } from '@/lib/server/search/users';
import type { SanitizedTerm } from '@/lib/server/search/sanitize';

describe('userSearcher', () => {
  beforeEach(() => {
    userOrMock.mockReset();
    roleInMock.mockReset();
    roleOrderMock.mockReset();
    communityInMock.mockReset();
    communityEqMock.mockReset();
    communityIsMock.mockReset();
    usersData = [];
    rolesData = [];
    rolesError = null;
    communitiesData = [];
    communitiesError = null;
  });

  it('builds the ilike filter directly from the given term, trusting it is already sanitized', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 5 }];
    communitiesData = [{ id: 5, is_demo: false, deleted_at: null }];

    await userSearcher.search('john_doe' as SanitizedTerm, 5);

    expect(userOrMock).toHaveBeenCalledTimes(1);
    expect(userOrMock.mock.calls[0]![0]).toBe(
      'full_name.ilike.%john_doe%,email.ilike.%john_doe%',
    );
  });

  it('links a single-community user to their community Members tab', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 5 }];
    communitiesData = [{ id: 5, is_demo: false, deleted_at: null }];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits).toEqual([
      { id: 'user-u1', label: 'Alice', meta: 'alice@test.com', href: '/clients/5?tab=members', icon: 'user' },
    ]);
    // No email (or any PII) in the href — the exact defect this replaced.
    expect(hits[0]!.href).not.toContain('@');
  });

  it('multi-community tiebreak: links to the MOST RECENTLY CREATED user_roles row (id desc)', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    // Rows arrive newest-first per the `.order('id', { ascending: false })`
    // call this test also asserts below — community 9 (id 30) is newer than
    // community 2 (id 10), even though 2 sorts first alphabetically/numerically
    // by community id, which is the footgun this tiebreak deliberately avoids.
    rolesData = [
      { user_id: 'u1', community_id: 9 },
      { user_id: 'u1', community_id: 2 },
    ];
    communitiesData = [
      { id: 9, is_demo: false, deleted_at: null },
      { id: 2, is_demo: false, deleted_at: null },
    ];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits[0]!.href).toBe('/clients/9?tab=members');
    expect(roleOrderMock).toHaveBeenCalledWith('id', { ascending: false });
  });

  it('falls back to the PII-free /clients link when the user has no community', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits[0]!.href).toBe('/clients');
  });

  it('looks up roles for every matched user in one batched query', async () => {
    usersData = [
      { id: 'u1', email: 'alice@test.com', full_name: 'Alice' },
      { id: 'u2', email: 'bob@test.com', full_name: 'Bob' },
    ];
    rolesData = [
      { user_id: 'u1', community_id: 1 },
      { user_id: 'u2', community_id: 2 },
    ];
    communitiesData = [
      { id: 1, is_demo: false, deleted_at: null },
      { id: 2, is_demo: false, deleted_at: null },
    ];

    await userSearcher.search('a' as SanitizedTerm, 5);

    expect(roleInMock).toHaveBeenCalledTimes(1);
    expect(roleInMock.mock.calls[0]![0]).toEqual(['u1', 'u2']);
  });

  it('skips the member lookup entirely when no users matched', async () => {
    usersData = [];

    const hits = await userSearcher.search('nobody' as SanitizedTerm, 5);

    expect(hits).toEqual([]);
    expect(roleInMock).not.toHaveBeenCalled();
  });

  it('throws on a member-lookup error rather than silently falling back', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesError = { message: 'connection reset' };

    await expect(userSearcher.search('alice' as SanitizedTerm, 5)).rejects.toThrow(
      'connection reset',
    );
  });

  it('scopes the palette destination to a community the detail page will actually serve: a user whose newest membership is soft-deleted links to their older REAL community, not the dead newest one', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    // id desc: the soft-deleted community (99) is the newest row, ordered
    // first — exactly the shape that 404'd in production for 6 real users
    // before this fix. The older row (community 5) is real and survives the
    // filter, so it must win instead.
    rolesData = [
      { user_id: 'u1', community_id: 99 },
      { user_id: 'u1', community_id: 5 },
    ];
    communitiesData = [
      { id: 99, is_demo: false, deleted_at: '2026-01-01T00:00:00Z' },
      { id: 5, is_demo: false, deleted_at: null },
    ];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits[0]!.href).toBe('/clients/5?tab=members');
  });

  it('falls back to /clients when every membership is a dead (soft-deleted or demo) community', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 99 }];
    communitiesData = [{ id: 99, is_demo: false, deleted_at: '2026-01-01T00:00:00Z' }];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits[0]!.href).toBe('/clients');
  });

  it('excludes a demo community from the destination pick, same as the sibling clients searcher', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    // Newest row (77) is a demo community; the older row (5) is real.
    rolesData = [
      { user_id: 'u1', community_id: 77 },
      { user_id: 'u1', community_id: 5 },
    ];
    communitiesData = [
      { id: 77, is_demo: true, deleted_at: null },
      { id: 5, is_demo: false, deleted_at: null },
    ];

    const hits = await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(hits[0]!.href).toBe('/clients/5?tab=members');
  });

  it('skips the communities lookup entirely when there are no candidate community ids', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [];

    await userSearcher.search('alice' as SanitizedTerm, 5);

    expect(communityInMock).not.toHaveBeenCalled();
  });

  it('throws on a communities-lookup error rather than silently falling back', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 5 }];
    communitiesError = { message: 'connection reset' };

    await expect(userSearcher.search('alice' as SanitizedTerm, 5)).rejects.toThrow(
      'connection reset',
    );
  });
});
