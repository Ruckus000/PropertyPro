import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P1-11: the member PATCH/DELETE route must not touch the root manager.
 *
 * A community has at most one root manager, enforced by a partial unique
 * index. Assigning one requires demoting the incumbent FIRST, in a
 * transaction, plus resolving open `root_claim_disputes` and writing an audit
 * event — all of which `reassignRootOp` does and a plain `.update()` does not.
 * The route previously accepted `role: 'root_manager'` and issued that plain
 * update, so it either 500'd on the unique index or silently created a second,
 * unaudited root.
 *
 * The DELETE side is the same defect on the other verb: removing the root's
 * row leaves the community in exactly the state `communities/rootless` exists
 * to surface.
 */

const requirePlatformAdmin = vi.fn();
const logAdminAction = vi.fn(async () => {});
const roleUpdate = vi.fn();
const roleDelete = vi.fn();

let existingRole: { id: number; role: string; designation: string | null } | null = null;

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'user_roles') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingRole, error: null }),
            }),
          }),
        }),
        update: (payload: unknown) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single: async () => roleUpdate(payload) }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single: async () => roleDelete() }),
            }),
          }),
        }),
      };
    },
  }),
}));

async function callPatch(body: unknown) {
  const mod = await import('@/app/api/admin/communities/[id]/members/[userId]/route');
  const req = new Request('http://localhost/api/admin/communities/1/members/u1', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return mod.PATCH(req as never, {
    params: Promise.resolve({ id: '1', userId: 'u1' }),
  } as never);
}

async function callDelete() {
  const mod = await import('@/app/api/admin/communities/[id]/members/[userId]/route');
  const req = new Request('http://localhost/api/admin/communities/1/members/u1', {
    method: 'DELETE',
  });
  return mod.DELETE(req as never, {
    params: Promise.resolve({ id: '1', userId: 'u1' }),
  } as never);
}

describe('member route root-manager protection', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    logAdminAction.mockClear();
    roleUpdate.mockReset();
    roleDelete.mockReset();
    roleUpdate.mockResolvedValue({ data: { id: 1 }, error: null });
    roleDelete.mockResolvedValue({ data: { id: 1 }, error: null });
    existingRole = { id: 1, role: 'resident', designation: null };
  });

  afterEach(() => vi.resetModules());

  it('refuses to ASSIGN root_manager and names the correct endpoint', async () => {
    const res = await callPatch({ role: 'root_manager' });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('USE_REASSIGN_ROOT');
    expect(json.error.message).toContain('reassign-root');
    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it('refuses to DEMOTE the incumbent root manager', async () => {
    existingRole = { id: 1, role: 'root_manager', designation: null };

    const res = await callPatch({ role: 'property_manager' });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('USE_REASSIGN_ROOT');
    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it('refuses to DELETE the root manager, which would orphan the community', async () => {
    existingRole = { id: 1, role: 'root_manager', designation: null };

    const res = await callDelete();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ROOT_MANAGER_PROTECTED');
    expect(roleDelete).not.toHaveBeenCalled();
  });

  it('still allows non-role edits on a root manager (e.g. display title)', async () => {
    existingRole = { id: 1, role: 'root_manager', designation: null };

    const res = await callPatch({ display_title: 'Managing Agent' });

    expect(res.status).toBe(200);
    expect(roleUpdate).toHaveBeenCalled();
  });

  it('allows an ordinary role change and audits it', async () => {
    const res = await callPatch({ role: 'property_manager' });

    expect(res.status).toBe(200);
    expect(roleUpdate).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'member_role_changed',
      communityId: 1,
      oldValues: { role: 'resident' },
    });
  });

  it('allows removing an ordinary member and audits it', async () => {
    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({ action: 'member_removed' });
  });

  it('returns 400, not 500, for a malformed JSON body', async () => {
    const res = await callPatch('{not json');

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
