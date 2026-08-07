import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P1-9: removing a platform admin must not be able to empty the roster.
 *
 * Every row in `platform_admin_users` is `super_admin` — there is no tier — so
 * any admin can remove any other. With zero admins left nobody can grant admin
 * back, because granting requires an admin session: the platform is
 * permanently locked out of its own console.
 */

const requirePlatformAdmin = vi.fn();
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
const deleteAdmin = vi.fn();
const insertAdmin = vi.fn();

let adminCount: { count: number | null; error: unknown } = { count: 2, error: null };
let existingRow: { user_id: string } | null = { user_id: 'target' };

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
      if (table !== 'platform_admin_users') throw new Error(`Unexpected table: ${table}`);
      return {
        // Two different select() shapes are used by the route: an existence
        // check (.eq().maybeSingle()) and a head count (select with options).
        select: (_cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count) {
            return Promise.resolve(adminCount);
          }
          return {
            eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }),
          };
        },
        delete: () => ({ eq: async () => deleteAdmin() }),
        insert: async () => insertAdmin(),
      };
    },
  }),
}));

// Only the POST/grant tests reach this; the DELETE route never imports it.
vi.mock('@/lib/auth/list-all-auth-users', () => ({
  listAllAuthUsers: async () => [{ id: 'new-user', email: 'new@example.com' }],
  buildAuthUserMap: async () => new Map(),
}));

async function callDelete(userId = 'target') {
  const mod = await import('@/app/api/admin/platform-admins/[userId]/route');
  const req = new Request(`http://localhost/api/admin/platform-admins/${userId}`, {
    method: 'DELETE',
  });
  return mod.DELETE(req as never, { params: Promise.resolve({ userId }) } as never);
}

describe('platform admin removal — last-admin floor', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'acting-admin', email: 'a@b.com' });
    logAdminAction.mockClear();
    deleteAdmin.mockReset();
    deleteAdmin.mockResolvedValue({ error: null });
    adminCount = { count: 2, error: null };
    existingRow = { user_id: 'target' };
  });

  afterEach(() => vi.resetModules());

  it('removes an admin when others remain, and audits it', async () => {
    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(deleteAdmin).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'platform_admin_removed',
      resourceId: 'target',
    });
  });

  it('refuses the removal that would empty the roster', async () => {
    adminCount = { count: 1, error: null };

    const res = await callDelete();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('LAST_ADMIN');
    expect(deleteAdmin).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the count cannot be determined', async () => {
    // A null count must not be read as "plenty of admins". This is the branch
    // where an availability-first reading of the code would open the hole.
    adminCount = { count: null, error: null };

    const res = await callDelete();

    expect(res.status).toBe(409);
    expect(deleteAdmin).not.toHaveBeenCalled();
  });

  it('fails closed when the count query errors', async () => {
    adminCount = { count: null, error: { message: 'boom' } };

    const res = await callDelete();

    expect(res.status).toBe(500);
    expect(deleteAdmin).not.toHaveBeenCalled();
  });

  it('still blocks self-removal before consulting the count', async () => {
    const res = await callDelete('acting-admin');

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('SELF_DELETE');
    expect(deleteAdmin).not.toHaveBeenCalled();
  });

  it('404s for an admin that does not exist, without auditing', async () => {
    existingRow = null;

    const res = await callDelete();

    expect(res.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // The count above cannot see a concurrent delete, so the 0056 trigger is what
  // actually holds the floor. When it fires, this route must return the same
  // 409 the pre-check returns — not the opaque 500 assertNoDbError would give.
  it('returns LAST_ADMIN, not a 500, when the floor trigger fires', async () => {
    deleteAdmin.mockResolvedValue({
      error: {
        code: '23514',
        message:
          'platform_admin_users must retain at least one row; refusing to remove the last platform admin',
      },
    });

    const res = await callDelete();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('LAST_ADMIN');
    // The delete did not happen, so there is nothing to audit.
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('still surfaces an unrelated delete failure as a 500', async () => {
    // Guards the mapping above from widening into "any delete error is a 409".
    deleteAdmin.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });

    const res = await callDelete();

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});

describe('platform admin grant — duplicate key', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'acting-admin', email: 'a@b.com' });
    logAdminAction.mockClear();
    insertAdmin.mockReset();
    existingRow = null; // the pre-check passes; the race happens after it
  });

  afterEach(() => vi.resetModules());

  async function callPost(email = 'new@example.com') {
    const mod = await import('@/app/api/admin/platform-admins/route');
    const req = new Request('http://localhost/api/admin/platform-admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return mod.POST(req as never);
  }

  // Cosmetic by design: the primary key already prevents the duplicate, so
  // nothing is at risk. This only stops a correctly-refused request from
  // arriving as a 500 with a Sentry event.
  it('returns ALREADY_ADMIN when the primary key rejects a concurrent grant', async () => {
    insertAdmin.mockResolvedValue({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "platform_admin_users_pkey"',
      },
    });

    const res = await callPost();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ALREADY_ADMIN');
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
