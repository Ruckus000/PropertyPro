import { beforeEach, describe, expect, it, vi } from 'vitest';

// public.users columns the requester lookup may select (packages/db/src/schema/users.ts).
// `raw_user_meta_data` lives on auth.users, not here; selecting it made PostgREST
// answer 42703 and the whole Deletion Requests screen 500 once one request existed.
const PUBLIC_USERS_COLUMNS = new Set(['id', 'email', 'full_name', 'phone', 'avatar_url', 'deleted_at']);

const usersSelect = vi.fn();

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'eq']) q[m] = () => q;
  q.in = () => Promise.resolve(result);
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table === 'account_deletion_requests') {
        return query({
          data: [{
            id: 7, request_type: 'user', user_id: 'user-1', community_id: null, status: 'cooling',
            cooling_ends_at: '2026-11-01T00:00:00.000Z', scheduled_purge_at: null, purged_at: null,
            cancelled_at: null, recovered_at: null, intervention_notes: null,
            created_at: '2026-10-01T00:00:00.000Z',
          }],
          error: null,
        });
      }
      if (table === 'users') {
        return {
          select: (cols: string) => {
            usersSelect(cols);
            const unknown = cols.split(',').map((c) => c.trim()).filter((c) => !PUBLIC_USERS_COLUMNS.has(c));
            return {
              in: () => Promise.resolve(unknown.length
                ? { data: null, error: { message: `column users.${unknown[0]} does not exist` } }
                : { data: [{ id: 'user-1', email: 'olivia@example.com', full_name: 'Olivia Owner' }], error: null }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

describe('getDeletionRequestsData', () => {
  beforeEach(() => usersSelect.mockReset());

  it('loads requester names from public.users columns that exist', async () => {
    const { getDeletionRequestsData } = await import('@/lib/server/deletion-requests');

    const { requests } = await getDeletionRequestsData();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ requesterEmail: 'olivia@example.com', requesterName: 'Olivia Owner' });
  });
});
