import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

// ---------------------------------------------------------------------------
// Hoisted mocks (mirrors blocks.test.ts)
// ---------------------------------------------------------------------------

const {
  discardSiteDraftsMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  discardSiteDraftsMock: vi.fn().mockResolvedValue({ discardedCount: 0 }),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  discardSiteDrafts: discardSiteDraftsMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

import { DELETE } from '@/app/api/v1/pm/site/drafts/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/drafts', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/pm/site/drafts (slice 8f)
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/pm/site/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    discardSiteDraftsMock.mockResolvedValue({ discardedCount: 0 });
  });

  it('200s and returns the discarded count', async () => {
    discardSiteDraftsMock.mockResolvedValueOnce({ discardedCount: 4 });
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true, discardedCount: 4 } });
    expect(discardSiteDraftsMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
    });
  });

  it('200s with discardedCount=0 when there was nothing pending', async () => {
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true, discardedCount: 0 } });
  });

  it('enforces hasSiteEditor (same gate as the blocks endpoints)', async () => {
    await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasSiteEditor');
  });

  it('400s when communityId is missing', async () => {
    const res = await DELETE(makeDeleteRequest({}));
    expect(res.status).toBe(400);
    expect(discardSiteDraftsMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await DELETE(makeDeleteRequest({ communityId: -3 }));
    expect(res.status).toBe(400);
    expect(discardSiteDraftsMock).not.toHaveBeenCalled();
  });

  it('403s when caller does not hold a PM manager role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(403);
    expect(discardSiteDraftsMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to discard drafts', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(200);
    expect(discardSiteDraftsMock).toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(401);
    expect(discardSiteDraftsMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await DELETE(makeDeleteRequest({ communityId: 42 }));
    expect(res.status).toBe(403);
    expect(discardSiteDraftsMock).not.toHaveBeenCalled();
  });
});
