import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  reorderSiteBlockMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  reorderSiteBlockMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  reorderSiteBlock: reorderSiteBlockMock,
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

import { POST } from '@/app/api/v1/pm/site/blocks/reorder/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/blocks/reorder', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_BODY = { communityId: 42, blockId: 12, direction: 'down' as const };

describe('POST /api/v1/pm/site/blocks/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    reorderSiteBlockMock.mockResolvedValue({ movedBlockId: 12, fromOrder: 2, toOrder: 3 });
  });

  it('200s and forwards args, returning the move result in the canonical envelope', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { ok: true, movedBlockId: 12, fromOrder: 2, toOrder: 3 },
    });
    expect(reorderSiteBlockMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 12,
      direction: 'down',
    });
  });

  it('200s for direction=up', async () => {
    reorderSiteBlockMock.mockResolvedValueOnce({ movedBlockId: 13, fromOrder: 3, toOrder: 2 });
    const res = await POST(makeRequest({ communityId: 42, blockId: 13, direction: 'up' }));
    expect(res.status).toBe(200);
    expect(reorderSiteBlockMock).toHaveBeenCalledWith(expect.objectContaining({ blockId: 13, direction: 'up' }));
  });

  it('allows CAM managers to reorder', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(reorderSiteBlockMock).toHaveBeenCalled();
  });

  it('404s when the service throws NotFoundError (block not a content block)', async () => {
    reorderSiteBlockMock.mockRejectedValueOnce(new NotFoundError('Content section not found for this community'));
    const res = await POST(makeRequest({ ...VALID_BODY, blockId: 999 }));
    expect(res.status).toBe(404);
  });

  it('400s when the service throws ValidationError (already first/last)', async () => {
    reorderSiteBlockMock.mockRejectedValueOnce(new ValidationError('Cannot move this section up: it is already first.'));
    const res = await POST(makeRequest({ ...VALID_BODY, direction: 'up' }));
    expect(res.status).toBe(400);
  });

  it('400s when direction is not up/down', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, direction: 'sideways' }));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when blockId is missing', async () => {
    const { blockId: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when blockId is not a positive integer', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, blockId: -1 }));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('403s when caller does not hold pm_admin or cam role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(new AppError('Not a member', 403, 'FORBIDDEN'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });
});
