import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const requestUpdate = vi.fn();
const usersUpdate = vi.fn();
const communitiesUpdate = vi.fn();

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
  }),
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
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
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
});
