import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A REAL community's branding PATCH was the one privileged mutation this phase
 * initially missed: the demo equivalent logged, and this one — which writes to
 * a live tenant's `communities.branding` through the service-role client — did
 * not. Caught in code review, not by any correctness gate.
 */

const requirePlatformAdmin = vi.fn();
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
const brandingUpdate = vi.fn();
// The live write — one atomic UPDATE in packages/db (`@propertypro/db/unsafe`).
const applyLive = vi.fn();
const resolveLogoPreviewUrl = vi.fn(async (..._args: unknown[]): Promise<string | null> => null);

vi.mock('@/lib/branding/logo-preview-url', () => ({
  resolveLogoPreviewUrl: (...args: unknown[]) => resolveLogoPreviewUrl(...args),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  applyLiveBrandingPatchUnscoped: (...args: unknown[]) => applyLive(...args),
}));

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
    // Required since `parseJsonBody` started refusing anything that is not
    // application/json — the cross-site-form CSRF vector. Omitting it here made
    // undici default to text/plain, which is precisely the shape being refused.
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return mod.PATCH(req as never, { params: Promise.resolve({ id: '7' }) } as never);
}

describe('community branding GET', () => {
  afterEach(() => vi.resetModules());

  it("returns a URL for the stored logo next to the branding, for this community's id", async () => {
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    resolveLogoPreviewUrl.mockResolvedValueOnce(null);
    const mod = await import('@/app/api/admin/communities/[id]/branding/route');

    const res = await mod.GET(new Request('http://localhost/x') as never, {
      params: Promise.resolve({ id: '7' }),
    } as never);

    // The stored branding in this file's admin-client mock has no logo.
    expect(resolveLogoPreviewUrl).toHaveBeenCalledWith(7, undefined);
    expect(await res.json()).toEqual({ branding: { primaryColor: '#000000' }, logoUrl: null });
  });
});

describe('community branding PATCH auditing', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    logAdminAction.mockClear();
    brandingUpdate.mockReset();
    brandingUpdate.mockResolvedValue({
      data: { branding: { primaryColor: '#123456' } },
      error: null,
    });
    applyLive.mockReset();
    applyLive.mockResolvedValue({
      before: { primaryColor: '#000000', draftLook: { primaryColor: '#ff0000' } },
      after: { primaryColor: '#123456' },
    });
  });

  afterEach(() => vi.resetModules());

  it('audits a real community branding change with old and new values', async () => {
    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'community_branding_changed',
      communityId: 7,
      oldValues: { primaryColor: '#000000', draftLook: { primaryColor: '#ff0000' } },
      newValues: { primaryColor: '#123456' },
    });
  });

  it('writes through the atomic op, never a whole-object update from a read', async () => {
    // Revert-check target: restoring the read → merge → `.update({ branding })`
    // shape makes this fail. That shape erased the manager's draft, site
    // settings and the asset quota whenever they were written in between.
    const res = await callPatch({ primaryColor: '#123456', logoPath: 'communities/7/logo.webp' });

    expect(res.status).toBe(200);
    expect(applyLive).toHaveBeenCalledWith(
      7,
      { primaryColor: '#123456', logoPath: 'communities/7/logo.webp' },
      { touchUpdatedAt: true },
    );
    expect(brandingUpdate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ branding: { primaryColor: '#123456' } });
  });

  it('returns 404 and audits nothing when the community vanished before the write', async () => {
    applyLive.mockResolvedValueOnce({ before: null, after: null });

    const res = await callPatch({ primaryColor: '#123456' });

    expect(res.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('still enforces the shared hex-colour refinement', async () => {
    const res = await callPatch({ primaryColor: 'not-a-colour' });

    expect(res.status).toBe(400);
    expect(applyLive).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('still enforces the shared font allowlist', async () => {
    const res = await callPatch({ fontHeading: 'Comic Sans MS' });

    expect(res.status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
