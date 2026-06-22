import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

const {
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  transformSiteImageMock,
  incrementAssetsUsageMock,
  logAuditEventMock,
  storageDownloadMock,
  storageUploadMock,
  storageRemoveMock,
  createAdminClientMock,
} = vi.hoisted(() => {
  const storageDownloadMock = vi.fn();
  const storageUploadMock = vi.fn();
  const storageRemoveMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        download: storageDownloadMock,
        upload: storageUploadMock,
        remove: storageRemoveMock,
      })),
    },
  }));
  return {
    requireAuthMock: vi.fn(),
    requireMembershipMock: vi.fn(),
    resolveEffectiveCommunityIdMock: vi.fn(),
    requirePlanFeatureMock: vi.fn(),
    transformSiteImageMock: vi.fn(),
    incrementAssetsUsageMock: vi.fn(),
    logAuditEventMock: vi.fn(),
    storageDownloadMock,
    storageUploadMock,
    storageRemoveMock,
    createAdminClientMock,
  };
});

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({ resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/site-assets/transform', () => ({ transformSiteImage: transformSiteImageMock }));
vi.mock('@/lib/site-assets/quota', () => ({ incrementAssetsUsage: incrementAssetsUsageMock }));
vi.mock('@propertypro/db', () => ({
  createAdminClient: createAdminClientMock,
  logAuditEvent: logAuditEventMock,
}));

import { POST } from '@/app/api/v1/site/images/finalize/route';

const VALID_BODY = {
  communityId: 42,
  storagePath: '42/hero/abc-def-photo.jpg',
  altText: 'Beachfront view at golden hour',
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/site/images/finalize', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

describe('POST /api/v1/site/images/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    storageDownloadMock.mockResolvedValue({ data: makeBlob(1000), error: null });
    transformSiteImageMock.mockResolvedValue({
      at1600w: Buffer.from(new Uint8Array(800)),
      at800w: Buffer.from(new Uint8Array(400)),
    });
    storageUploadMock.mockResolvedValue({ error: null });
    storageRemoveMock.mockResolvedValue({ data: null, error: null });
    incrementAssetsUsageMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('200s with the two variant paths', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      variant1600Path: '42/hero/abc-def-photo.jpg.1600w.webp',
      variant800Path: '42/hero/abc-def-photo.jpg.800w.webp',
      altText: 'Beachfront view at golden hour',
    });
  });

  it('uploads both variants with image/webp content-type', async () => {
    await POST(makeRequest(VALID_BODY));
    expect(storageUploadMock).toHaveBeenCalledTimes(2);
    for (const call of storageUploadMock.mock.calls) {
      const [, , opts] = call;
      expect(opts).toMatchObject({ contentType: 'image/webp' });
    }
  });

  it('increments quota by combined variant byte length', async () => {
    await POST(makeRequest(VALID_BODY));
    expect(incrementAssetsUsageMock).toHaveBeenCalledWith(42, 1200); // 800 + 400
  });

  it('audit-logs site_image creation', async () => {
    await POST(makeRequest(VALID_BODY));
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      communityId: 42,
      action: 'create',
      resourceType: 'site_image',
    }));
  });

  it('400s when storagePath does not belong to the supplied communityId', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, storagePath: '99/hero/x.jpg' }));
    expect(res.status).toBe(400);
    expect(storageDownloadMock).not.toHaveBeenCalled();
  });

  it('400s on malformed storagePath', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, storagePath: 'not-a-valid-path' }));
    expect(res.status).toBe(400);
  });

  it('400s when altText is empty', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, altText: '' }));
    expect(res.status).toBe(400);
  });

  it('500s when storage download fails', async () => {
    storageDownloadMock.mockResolvedValueOnce({ data: null, error: new Error('not found') });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('500s when sharp transform fails', async () => {
    transformSiteImageMock.mockRejectedValueOnce(new Error('Invalid input image'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('500s when storage upload fails', async () => {
    storageUploadMock.mockResolvedValueOnce({ error: new Error('storage error') });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when plan lacks hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new AppError('upgrade', 403, 'PLAN_UPGRADE_REQUIRED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('unauthorized', 401, 'UNAUTHORIZED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('removes the raw upload after both variants succeed', async () => {
    await POST(makeRequest(VALID_BODY));
    expect(storageRemoveMock).toHaveBeenCalledWith([VALID_BODY.storagePath]);
  });

  it('compensates by removing the succeeded variant when its sibling upload fails', async () => {
    // 1600w succeeds, 800w fails → finalize should throw 500 AND remove the
    // orphaned 1600w. Without compensation the 1600w would be stranded in
    // storage with no DB row, no quota counter bump, and no path to cleanup.
    storageUploadMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('storage upload failed') });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    // The raw-upload .remove() is NOT called on failure (we never reach that
    // line), but the compensating .remove() of the succeeded variant IS:
    const removeCalls = storageRemoveMock.mock.calls.map((c) => c[0]);
    expect(removeCalls).toContainEqual([`${VALID_BODY.storagePath}.1600w.webp`]);
    // Quota counter must NOT have been bumped on the failure path:
    expect(incrementAssetsUsageMock).not.toHaveBeenCalled();
  });

  it('still 200s when raw-upload removal fails (best-effort cleanup)', async () => {
    storageRemoveMock.mockResolvedValueOnce({ data: null, error: new Error('remove failed') });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
