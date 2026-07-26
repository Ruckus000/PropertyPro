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
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    reorderSiteBlockMock.mockResolvedValue({ movedBlockId: 12, fromOrder: 2, toOrder: 3, unchanged: false });
  });

  it('200s and forwards args, returning the move result in the canonical envelope', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { ok: true, movedBlockId: 12, fromOrder: 2, toOrder: 3, unchanged: false },
    });
    expect(reorderSiteBlockMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 12,
      direction: 'down',
    });
  });

  it('200s for direction=up', async () => {
    reorderSiteBlockMock.mockResolvedValueOnce({ movedBlockId: 13, fromOrder: 3, toOrder: 2, unchanged: false });
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

  // --- absolute moves (v3 Phase 2b-2 drag-and-drop) -----------------------

  it('200s for an absolute toOrder and forwards it without a direction', async () => {
    reorderSiteBlockMock.mockResolvedValueOnce({
      movedBlockId: 12, fromOrder: 5, toOrder: 2, unchanged: false,
    });
    const res = await POST(makeRequest({ communityId: 42, blockId: 12, toOrder: 2 }));
    expect(res.status).toBe(200);
    // The service rejects "both supplied", so the route must omit the key
    // entirely rather than pass an explicit undefined alongside it.
    expect(reorderSiteBlockMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 12,
      toOrder: 2,
    });
    expect(reorderSiteBlockMock.mock.calls[0]![0]).not.toHaveProperty('direction');
  });

  it('reports a no-op drop without pretending something moved', async () => {
    reorderSiteBlockMock.mockResolvedValueOnce({
      movedBlockId: 12, fromOrder: 3, toOrder: 3, unchanged: true,
    });
    const res = await POST(makeRequest({ communityId: 42, blockId: 12, toOrder: 3 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { ok: true, movedBlockId: 12, fromOrder: 3, toOrder: 3, unchanged: true },
    });
  });

  it('400s when neither direction nor toOrder is supplied', async () => {
    const res = await POST(makeRequest({ communityId: 42, blockId: 12 }));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when BOTH direction and toOrder are supplied', async () => {
    // Ambiguous input must be rejected, not silently resolved by precedence.
    const res = await POST(
      makeRequest({ communityId: 42, blockId: 12, direction: 'up', toOrder: 4 }),
    );
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when toOrder targets the hero slot', async () => {
    // Order 1 is the hero: not reorderable and never a legal drop target.
    const res = await POST(makeRequest({ communityId: 42, blockId: 12, toOrder: 1 }));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
  });

  it('400s when toOrder is out of range', async () => {
    for (const toOrder of [0, -3, 100, 1.5]) {
      reorderSiteBlockMock.mockClear();
      const res = await POST(makeRequest({ communityId: 42, blockId: 12, toOrder }));
      expect(res.status, `toOrder=${toOrder}`).toBe(400);
      expect(reorderSiteBlockMock).not.toHaveBeenCalled();
    }
  });

  it('400s on an unknown body field', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, sneaky: true }));
    expect(res.status).toBe(400);
    expect(reorderSiteBlockMock).not.toHaveBeenCalled();
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
