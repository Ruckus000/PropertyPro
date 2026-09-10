import { beforeEach, describe, expect, it, vi } from 'vitest';

const userOrMock = vi.fn();
const roleInMock = vi.fn();
const roleOrderMock = vi.fn();

let usersData: Array<{ id: string; email: string; full_name: string | null }> = [];
let rolesData: Array<{ user_id: string; community_id: number }> = [];
let rolesError: { message: string } | null = null;

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
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'user_roles') throw new Error(`Unexpected untyped table: ${table}`);
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
    usersData = [];
    rolesData = [];
    rolesError = null;
  });

  it('builds the ilike filter directly from the given term, trusting it is already sanitized', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 5 }];

    await userSearcher.search('john_doe' as SanitizedTerm, 5);

    expect(userOrMock).toHaveBeenCalledTimes(1);
    expect(userOrMock.mock.calls[0]![0]).toBe(
      'full_name.ilike.%john_doe%,email.ilike.%john_doe%',
    );
  });

  it('links a single-community user to their community Members tab', async () => {
    usersData = [{ id: 'u1', email: 'alice@test.com', full_name: 'Alice' }];
    rolesData = [{ user_id: 'u1', community_id: 5 }];

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
});
