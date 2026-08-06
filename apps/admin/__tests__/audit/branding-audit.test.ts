import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A REAL community's branding PATCH was the one privileged mutation this phase
 * initially missed: the demo equivalent logged, and this one — which writes to
 * a live tenant's `communities.branding` through the service-role client — did
 * not. Caught in code review, not by any correctness gate.
 */

const requirePlatformAdmin = vi.fn();
const logAdminAction = vi.fn(async () => {});
const brandingUpdate = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

vi.mock('@/lib/api/resolve-community', () => ({
  resolveAndVerifyCommunity: async () => 7,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'communities') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { branding: { primaryColor: '#000000' } }, error: null }),
          }),
        }),
        update: (payload: unknown) => ({
          eq: () => ({
            select: () => ({ single: async () => brandingUpdate(payload) }),
          }),
        }),
      };
    },
  }),
}));

async function callPatch(body: unknown) {
  const mod = await import('@/app/api/admin/communities/[id]/branding/route');
  const req = new Request('http://localhost/api/admin/communities/7/branding', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return mod.PATCH(req as never, { params: Promise.resolve({ id: '7' }) } as never);
}

describe('community branding PATCH auditing', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    logAdminAction.mockClear();
    brandingUpdate.mockReset();
    brandingUpdate.mockResolvedValue({
      data: { branding: { primaryColor: '#123456' } },
      error: null,
    });
  });

  afterEach(() => vi.resetModules());

  it('audits a real community branding change with old and new values', async () => {
    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'community_branding_changed',
      communityId: 7,
      oldValues: { primaryColor: '#000000' },
    });
  });

  it('still enforces the shared hex-colour refinement', async () => {
    const res = await callPatch({ primaryColor: 'not-a-colour' });

    expect(res.status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('still enforces the shared font allowlist', async () => {
    const res = await callPatch({ fontHeading: 'Comic Sans MS' });

    expect(res.status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
