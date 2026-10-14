import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const requestUpdate = vi.fn();
const usersUpdate = vi.fn();
const communitiesUpdate = vi.fn();
const updateUserById = vi.fn();

function makeFromMock(table: string) {
  switch (table) {
    case 'account_deletion_requests':
      return {
        update: (payload: unknown) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => requestUpdate(payload),
              }),
            }),
          }),
        }),
      };
    case 'users':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => usersUpdate(payload, val),
        }),
      };
    case 'communities':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => communitiesUpdate(payload, val),
        }),
      };
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => makeFromMock(table),
    auth: { admin: { updateUserById: (...args: unknown[]) => updateUserById(...args) } },
  }),
}));


// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

async function callRecover(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/recover/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    requestUpdate.mockReset();
    usersUpdate.mockReset();
    communitiesUpdate.mockReset();
    updateUserById.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    usersUpdate.mockResolvedValue({ error: null });
    communitiesUpdate.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears users.deleted_at when recovering a user-type request', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(usersUpdate).toHaveBeenCalledWith({ deleted_at: null }, 'user-uuid');
    // The lifecycle cron banned the login at soft delete; recovery must lift it.
    expect(updateUserById).toHaveBeenCalledWith('user-uuid', {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });

  it('clears communities.deleted_at when recovering a community-type request', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'community', user_id: null, community_id: 99 },
      error: null,
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(communitiesUpdate).toHaveBeenCalledWith({ deleted_at: null }, 99);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('returns 404 when the request is not in soft_deleted status', async () => {
    requestUpdate.mockResolvedValue({ data: null, error: null });

    const response = await callRecover('42');

    expect(response.status).toBe(404);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 with USER_RESTORE_FAILED when users.deleted_at clear fails', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    usersUpdate.mockResolvedValue({ error: { message: 'rls denied' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_RESTORE_FAILED');
  });

  it('returns 500 with USER_UNBAN_FAILED when lifting the auth ban fails', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_UNBAN_FAILED');
  });
});
