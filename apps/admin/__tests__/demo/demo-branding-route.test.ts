import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The demo branding PATCH writes the seeded demo community's branding LIVE
 * through the same atomic op as the real-community route. A demo's manager
 * can save a design draft in the web editor too, so the read → merge →
 * whole-object `.update()` it used to do could erase that draft, and a stale
 * draft could revert the admin's change on Publish.
 */

const requirePlatformAdmin = vi.fn();
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
const markDemoCustomized = vi.fn(async (..._args: unknown[]) => {});
const getDemoCommunityId = vi.fn(async (..._args: unknown[]): Promise<number | null> => 42);
const applyLive = vi.fn();
const supabaseUpdate = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

vi.mock('@/lib/db/demo-queries', () => ({
  getDemoCommunityId: (...args: unknown[]) => getDemoCommunityId(...args),
  markDemoCustomized: (...args: unknown[]) => markDemoCustomized(...args),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  applyLiveBrandingPatchUnscoped: (...args: unknown[]) => applyLive(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: unknown) => {
        supabaseUpdate(payload);
        throw new Error('the PATCH must not write branding through supabase-js');
      },
    }),
  }),
}));

async function callPatch(body: unknown, id = '5') {
  const mod = await import('@/app/api/admin/demos/[id]/community/branding/route');
  const req = new Request(`http://localhost/api/admin/demos/${id}/community/branding`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return mod.PATCH(req as never, { params: Promise.resolve({ id }) } as never);
}

describe('demo branding PATCH', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    logAdminAction.mockClear();
    markDemoCustomized.mockClear();
    getDemoCommunityId.mockClear();
    getDemoCommunityId.mockResolvedValue(42);
    supabaseUpdate.mockReset();
    applyLive.mockReset();
    applyLive.mockResolvedValue({
      before: { primaryColor: '#000000' },
      after: { primaryColor: '#123456' },
    });
  });

  afterEach(() => vi.resetModules());

  it('writes through the atomic op, marks the demo customized, and audits before/after', async () => {
    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(200);
    expect(applyLive).toHaveBeenCalledWith(42, { primaryColor: '#123456' }, { touchUpdatedAt: true });
    expect(supabaseUpdate).not.toHaveBeenCalled();
    expect(markDemoCustomized).toHaveBeenCalledWith(5);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'demo_branding_changed',
      communityId: 42,
      oldValues: { primaryColor: '#000000' },
      newValues: { primaryColor: '#123456' },
      metadata: { source: 'admin_platform', demo_id: 5 },
    });
    expect(await res.json()).toEqual({ branding: { primaryColor: '#123456' } });
  });

  it('returns 404 for an unknown demo without writing', async () => {
    getDemoCommunityId.mockResolvedValueOnce(null);

    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(404);
    expect(applyLive).not.toHaveBeenCalled();
  });

  it('returns 404 and audits nothing when the community vanished before the write', async () => {
    applyLive.mockResolvedValueOnce({ before: null, after: null });

    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(404);
    expect(markDemoCustomized).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects an unknown key (strict schema) without writing', async () => {
    const res = await callPatch({ draftLook: { primaryColor: '#123456' } });

    expect(res.status).toBe(400);
    expect(applyLive).not.toHaveBeenCalled();
  });
});
