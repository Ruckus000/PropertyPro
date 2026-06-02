import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return { requirePlatformAdminMock: vi.fn(), createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })), fromMock };
});
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { POST } from '@/app/api/admin/site-templates/starter-packs/[slug]/new-version/route';

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };
const BASE = { id: 1, slug: 'florida-condo-v1', display_name: 'FL', community_type: 'condo_718', description: 'd', blocks: [{ blockType: 'hero', blockOrder: 1, content: HERO }], version: 1, is_archived: false, created_at: 't', updated_at: 't' };
function req(body: unknown) { return new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json' } }); }

beforeEach(() => { vi.clearAllMocks(); requirePlatformAdminMock.mockResolvedValue({ id: 'a', email: 'a@b.co', role: 'super_admin' }); });
afterEach(() => vi.restoreAllMocks());

it('creates florida-condo-v2 at version 2, copying base blocks', async () => {
  let inserted: Record<string, unknown> = {};
  fromMock
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) })
    .mockReturnValueOnce({ insert: (v: Record<string, unknown>) => { inserted = v; return { select: () => ({ single: () => Promise.resolve({ data: { ...BASE, id: 2, slug: 'florida-condo-v2', version: 2 }, error: null }) }) }; } });
  const res = await POST(req({}) as any, ctx('florida-condo-v1'));
  expect(res.status).toBe(201);
  expect(inserted).toMatchObject({ slug: 'florida-condo-v2', version: 2, community_type: 'condo_718' });
  expect((await res.json()).pack.slug).toBe('florida-condo-v2');
});

it('404s when the base pack is missing', async () => {
  fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) });
  const res = await POST(req({}) as any, ctx('nope'));
  expect(res.status).toBe(404);
});

it('400s on invalid body-supplied blocks', async () => {
  fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) });
  const res = await POST(req({ blocks: [{ blockType: 'hero', blockOrder: 5, content: HERO }] }) as any, ctx('florida-condo-v1'));
  expect(res.status).toBe(400);
});

it('409s on slug collision', async () => {
  fromMock
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) })
    .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }) });
  const res = await POST(req({}) as any, ctx('florida-condo-v1'));
  expect(res.status).toBe(409);
});
