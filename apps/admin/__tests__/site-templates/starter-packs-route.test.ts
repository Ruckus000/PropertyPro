import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })),
    fromMock,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { GET, POST } from '@/app/api/admin/site-templates/starter-packs/route';
import { ForbiddenError } from '@propertypro/shared/http';

const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };
const VALID_BLOCKS = [
  { blockType: 'hero', blockOrder: 1, content: HERO },
  { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
];

function postReq(body: unknown) {
  return new Request('http://localhost/api/admin/site-templates/starter-packs', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@b.co', role: 'super_admin' });
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/admin/site-templates/starter-packs', () => {
  it('200s and returns the shaped pack list', async () => {
    fromMock.mockReturnValue({
      select: () => ({ order: () => ({ order: () => ({ limit: () => Promise.resolve({
        data: [{ id: 1, slug: 'florida-condo-v1', display_name: 'FL Condo', community_type: 'condo_718', description: null, blocks: [], version: 1, is_archived: false, created_at: 't', updated_at: 't' }],
        error: null,
      }) }) }) }),
    });
    const res = await GET(new Request('http://localhost/api/admin/site-templates/starter-packs') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.packs[0]).toMatchObject({ slug: 'florida-condo-v1', communityType: 'condo_718', displayName: 'FL Condo' });
  });
});

describe('POST /api/admin/site-templates/starter-packs', () => {
  function wireInsert({ existingCount = 0 } = {}) {
    // First .from() call → same-type count; second → insert chain.
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: existingCount, error: null }) }) }) })
      .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({
        data: { id: 9, slug: 'apartment-v1', display_name: 'Apt', community_type: 'apartment', description: null, blocks: VALID_BLOCKS, version: 1, is_archived: false, created_at: 't', updated_at: 't' },
        error: null,
      }) }) }) });
  }

  it('201s and creates a pack when none exists for the type', async () => {
    wireInsert({ existingCount: 0 });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }) as any);
    expect(res.status).toBe(201);
    expect((await res.json()).pack.slug).toBe('apartment-v1');
  });

  it('409s when a non-archived pack already exists for the community type', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v2', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }) as any);
    expect(res.status).toBe(409);
  });

  it('400s on invalid blocks (duplicate blockOrder)', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: [
      { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5 } },
    ] }) as any);
    expect(res.status).toBe(400);
  });

  it('409s on duplicate slug (Postgres 23505)', async () => {
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) }) })
      .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }) as any);
    expect(res.status).toBe(409);
  });

  it('400s on a bad communityType enum', async () => {
    const res = await POST(postReq({ slug: 'x-v1', displayName: 'X', communityType: 'mansion', blocks: VALID_BLOCKS }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 403 when not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new ForbiddenError('Platform admin access required'));
    await expect(GET(new Request('http://localhost/api/admin/site-templates/starter-packs') as any)).resolves.toHaveProperty('status', 403);
  });
});
