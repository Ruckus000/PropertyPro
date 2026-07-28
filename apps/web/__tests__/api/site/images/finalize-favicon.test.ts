/**
 * Website editor v3, Phase 8 — `/api/v1/site/images/finalize-favicon`.
 *
 * The §2.4 floor plus the two failure modes that cost real money or real
 * bytes: a partial variant upload must not strand an orphan, and the quota
 * must never be decremented for a delete that did not happen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/api/errors';

const {
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  incrementAssetsUsageMock,
  decrementAssetsUsageMock,
  resizeFaviconMock,
  setSiteFaviconMock,
  createAdminClientMock,
  uploadMock,
  removeMock,
  downloadMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  incrementAssetsUsageMock: vi.fn(),
  decrementAssetsUsageMock: vi.fn(),
  resizeFaviconMock: vi.fn(),
  setSiteFaviconMock: vi.fn(),
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
vi.mock('@/lib/site-assets/quota', () => ({
  incrementAssetsUsage: incrementAssetsUsageMock,
  decrementAssetsUsage: decrementAssetsUsageMock,
}));
vi.mock('@/lib/services/image-processor', () => ({ resizeFavicon: resizeFaviconMock }));
vi.mock('@/lib/services/site-settings-service', () => ({ setSiteFavicon: setSiteFaviconMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return actual;
});

import { POST } from '@/app/api/v1/site/images/finalize-favicon/route';

const COMMUNITY_ID = 42;
const PATH = '42/favicon/uuid-logo.png';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/site/images/finalize-favicon', {
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
  incrementAssetsUsageMock.mockResolvedValue(undefined);
  decrementAssetsUsageMock.mockResolvedValue(undefined);
  resizeFaviconMock.mockResolvedValue({
    icon32: Buffer.alloc(100),
    appleTouch180: Buffer.alloc(400),
  });
  setSiteFaviconMock.mockResolvedValue({ previous: null });
  downloadMock.mockResolvedValue({ data: new Blob([Buffer.alloc(10)]), error: null });
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
  createAdminClientMock.mockReturnValue({
    storage: {
      from: () => ({ download: downloadMock, upload: uploadMock, remove: removeMock }),
    },
  });
});

describe('authorized', () => {
  it('writes both variants, increments quota and records the paths', async () => {
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      icon32Path: `${PATH}.32.png`,
      appleTouch180Path: `${PATH}.180.png`,
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    // Both variants are PNG — apple-touch-icon has no reliable WebP support.
    for (const call of uploadMock.mock.calls) {
      expect(call[2]).toMatchObject({ contentType: 'image/png' });
    }
    expect(incrementAssetsUsageMock).toHaveBeenCalledWith(COMMUNITY_ID, 500);
    expect(setSiteFaviconMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      favicon: { icon32Path: `${PATH}.32.png`, appleTouch180Path: `${PATH}.180.png` },
    });
  });

  it('deletes the raw upload once the variants are stored', async () => {
    await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));
    expect(removeMock).toHaveBeenCalledWith([PATH]);
  });
});

describe('authorization', () => {
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
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // The path carries the tenant. A manager of 42 must not be able to finalize
  // bytes sitting under another community's prefix.
  it('rejects a storagePath belonging to another community', async () => {
    const res = await POST(
      request({ communityId: COMMUNITY_ID, storagePath: '99/favicon/uuid-x.png' }),
    );
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a storagePath that is not a favicon upload', async () => {
    const res = await POST(
      request({ communityId: COMMUNITY_ID, storagePath: '42/hero/uuid-x.png' }),
    );
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects a traversal-shaped path', async () => {
    const res = await POST(
      request({ communityId: COMMUNITY_ID, storagePath: '42/favicon/../../etc/passwd' }),
    );
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it('rejects an unknown key', async () => {
    const res = await POST(
      request({ communityId: COMMUNITY_ID, storagePath: PATH, altText: 'x' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing storagePath', async () => {
    const res = await POST(request({ communityId: COMMUNITY_ID }));
    expect(res.status).toBe(400);
  });
});

describe('partial failure', () => {
  it('compensates by deleting the variant that succeeded', async () => {
    uploadMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'boom' } });

    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(500);
    expect(removeMock).toHaveBeenCalledWith([`${PATH}.32.png`]);
    // Nothing was recorded and nothing was charged for.
    expect(incrementAssetsUsageMock).not.toHaveBeenCalled();
    expect(setSiteFaviconMock).not.toHaveBeenCalled();
  });

  it('surfaces a download failure without touching storage or quota', async () => {
    downloadMock.mockResolvedValue({ data: null, error: { message: 'gone' } });
    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));
    expect(res.status).toBe(500);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(incrementAssetsUsageMock).not.toHaveBeenCalled();
  });
});

describe('replacing an existing favicon', () => {
  const previous = {
    icon32Path: '42/favicon/old.png.32.png',
    appleTouch180Path: '42/favicon/old.png.180.png',
  };

  it('deletes the replaced variants and releases their quota', async () => {
    setSiteFaviconMock.mockResolvedValue({ previous });
    await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(removeMock).toHaveBeenCalledWith([previous.icon32Path, previous.appleTouch180Path]);
    expect(decrementAssetsUsageMock).toHaveBeenCalledWith(COMMUNITY_ID, 500);
  });

  // Decrementing for a delete that failed under-counts permanently, and an
  // under-counted quota is how a community slips past its plan ceiling.
  it('does NOT decrement the quota when the delete fails', async () => {
    setSiteFaviconMock.mockResolvedValue({ previous });
    removeMock.mockImplementation((paths: string[]) =>
      paths[0] === previous.icon32Path
        ? Promise.resolve({ error: { message: 'storage down' } })
        : Promise.resolve({ error: null }),
    );

    const res = await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    expect(res.status).toBe(200);
    expect(decrementAssetsUsageMock).not.toHaveBeenCalled();
  });

  it('does not delete paths the new favicon reuses', async () => {
    setSiteFaviconMock.mockResolvedValue({
      previous: { icon32Path: `${PATH}.32.png`, appleTouch180Path: `${PATH}.180.png` },
    });
    await POST(request({ communityId: COMMUNITY_ID, storagePath: PATH }));

    // Only the raw-upload cleanup ran — deleting the paths just written would
    // leave the community with a favicon record pointing at nothing.
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith([PATH]);
    expect(decrementAssetsUsageMock).not.toHaveBeenCalled();
  });
});
