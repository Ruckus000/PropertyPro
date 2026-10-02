/**
 * Website builder v4, Phase 5 — `/api/v1/site/images/finalize-share-image`.
 *
 * The authorization floor, the kind check, and the two money paths: the quota
 * is charged for the new image and released for the replaced one only when
 * its delete succeeded, by exactly the bytes recorded with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/api/errors';

const {
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
  incrementAssetsUsageMock,
  decrementAssetsUsageMock,
  resizeShareImageMock,
  setSiteShareImageMock,
  createAdminClientMock,
  uploadMock,
  removeMock,
  downloadMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  incrementAssetsUsageMock: vi.fn(),
  decrementAssetsUsageMock: vi.fn(),
  resizeShareImageMock: vi.fn(),
  setSiteShareImageMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  downloadMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/site-assets/quota', () => ({
  incrementAssetsUsage: incrementAssetsUsageMock,
  decrementAssetsUsage: decrementAssetsUsageMock,
}));
vi.mock('@/lib/services/image-processor', () => ({ resizeShareImage: resizeShareImageMock }));
vi.mock('@/lib/services/site-settings-service', () => ({
  setSiteShareImage: setSiteShareImageMock,
}));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));

import { POST } from '@/app/api/v1/site/images/finalize-share-image/route';

const COMMUNITY_ID = 42;
const PATH = '42/share/uuid-pool.jpg';
const OUT = `${PATH}.1200x630.jpg`;

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/site/images/finalize-share-image', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: COMMUNITY_ID });
  resolveEffectiveCommunityIdMock.mockImplementation((_req, id: number) => id);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  incrementAssetsUsageMock.mockResolvedValue(undefined);
  decrementAssetsUsageMock.mockResolvedValue(undefined);
  resizeShareImageMock.mockResolvedValue(Buffer.alloc(900));
  setSiteShareImageMock.mockResolvedValue({ previous: null });
  downloadMock.mockResolvedValue({ data: new Blob([new Uint8Array(10)]), error: null });
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
  createAdminClientMock.mockReturnValue({
    storage: { from: () => ({ download: downloadMock, upload: uploadMock, remove: removeMock }) },
  });
});

describe('authorized', () => {
  it('writes one 1200x630 JPEG, charges its bytes and records it', async () => {
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ path: OUT, bytes: 900 });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0]?.[0]).toBe(OUT);
    expect(uploadMock.mock.calls[0]?.[2]).toMatchObject({ contentType: 'image/jpeg' });
    expect(removeMock).toHaveBeenCalledWith([PATH]);
    expect(incrementAssetsUsageMock).toHaveBeenCalledWith(COMMUNITY_ID, 900);
    expect(setSiteShareImageMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      shareImage: { path: OUT, bytes: 900 },
    });
    expect(decrementAssetsUsageMock).not.toHaveBeenCalled();
  });

  it('releases the replaced image by exactly the bytes recorded with it', async () => {
    setSiteShareImageMock.mockResolvedValue({ previous: { path: '42/share/old.jpg', bytes: 777 } });
    await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(removeMock).toHaveBeenCalledWith(['42/share/old.jpg']);
    expect(decrementAssetsUsageMock).toHaveBeenCalledWith(COMMUNITY_ID, 777);
  });

  it('keeps charging for the replaced image when its delete fails', async () => {
    setSiteShareImageMock.mockResolvedValue({ previous: { path: '42/share/old.jpg', bytes: 777 } });
    removeMock.mockImplementation(async (paths: string[]) =>
      paths[0] === '42/share/old.jpg' ? { error: { message: 'nope' } } : { error: null },
    );
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(200);
    expect(decrementAssetsUsageMock).not.toHaveBeenCalled();
  });

  it('records nothing when the processed image fails to upload', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage down' } });
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(500);
    expect(incrementAssetsUsageMock).not.toHaveBeenCalled();
    expect(setSiteShareImageMock).not.toHaveBeenCalled();
  });
});

describe('authorization and input', () => {
  it('refuses a demo in its grace window before membership runs', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));
    expect(res.status).toBe(403);
    expect(requireMembershipMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a non-manager', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'resident', communityId: COMMUNITY_ID });
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));
    expect(res.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a community without the site-editor plan feature', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('nope'));
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));
    expect(res.status).toBe(403);
  });

  it("rejects another community's path, and an upload of a different kind", async () => {
    expect(
      (await POST(request({ communityId: COMMUNITY_ID, storagePath: '99/share/uuid-x.jpg' }))).status,
    ).toBe(400);
    expect(
      (await POST(request({ communityId: COMMUNITY_ID, storagePath: '42/hero/uuid-x.jpg' }))).status,
    ).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects extra body keys', async () => {
    const res = await POST(
      request({ communityId: COMMUNITY_ID, storagePath: PATH, bytes: 1 }),
    );
    expect(res.status).toBe(400);
  });
});
