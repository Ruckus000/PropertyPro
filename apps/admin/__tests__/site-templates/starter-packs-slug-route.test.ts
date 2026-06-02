import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return { requirePlatformAdminMock: vi.fn(), createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })), fromMock };
});
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { PATCH, DELETE } from '@/app/api/admin/site-templates/starter-packs/[slug]/route';

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
function patchReq(body: unknown) {
  return new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}
const ROW = { id: 1, slug: 'florida-condo-v1', display_name: 'FL', community_type: 'condo_718', description: null, blocks: [], version: 1, is_archived: false, created_at: 't', updated_at: 't' };

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue({ id: 'a', email: 'a@b.co', role: 'super_admin' });
});
afterEach(() => vi.restoreAllMocks());

describe('PATCH [slug]', () => {
  it('200s and updates display_name', async () => {
    let captured: Record<string, unknown> = {};
    fromMock.mockReturnValueOnce({ update: (u: Record<string, unknown>) => { captured = u; return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...ROW, display_name: 'New' }, error: null }) }) }) }; } });
    const res = await PATCH(patchReq({ displayName: 'New', communityType: 'apartment' }) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect(captured).toHaveProperty('display_name', 'New');
    expect(captured).not.toHaveProperty('community_type'); // immutable — ignored
  });

  it('400s when no editable fields are supplied', async () => {
    const res = await PATCH(patchReq({}) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(400);
  });

  it('404s when the pack is missing', async () => {
    fromMock.mockReturnValueOnce({ update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) }) });
    const res = await PATCH(patchReq({ displayName: 'X' }) as any, ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('400s on invalid blocks', async () => {
    const res = await PATCH(patchReq({ blocks: [{ blockType: 'hero', blockOrder: 2, content: {} }] }) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE [slug] (archive)', () => {
  it('409s when it is the last non-archived pack for the type', async () => {
    // 1) read pack; 2) count OTHER non-archived for type → 0
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: false }, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => Promise.resolve({ count: 0, error: null }) }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(409);
  });

  it('archives when another non-archived pack remains for the type', async () => {
    let captured: Record<string, unknown> = {};
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: false }, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => Promise.resolve({ count: 1, error: null }) }) }) }) })
      .mockReturnValueOnce({ update: (u: Record<string, unknown>) => { captured = u; return { eq: () => Promise.resolve({ error: null }) }; } });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect(captured).toHaveProperty('is_archived', true);
    expect((await res.json())).toEqual({ archived: true, deleted: false });
  });

  it('is idempotent when already archived (no last-pack guard needed)', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: true }, error: null }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as any, ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ archived: true, deleted: false });
  });

  it('404s when the pack is missing', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as any, ctx('nope'));
    expect(res.status).toBe(404);
  });
});

describe('auth', () => {
  it('PATCH rejects when not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    await expect(PATCH(patchReq({ displayName: 'X' }) as any, ctx('florida-condo-v1'))).rejects.toThrow('not-admin');
  });

  it('DELETE rejects when not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    await expect(DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as any, ctx('florida-condo-v1'))).rejects.toThrow('not-admin');
  });
});
