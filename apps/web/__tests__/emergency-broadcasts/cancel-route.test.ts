/**
 * Route unit tests — `POST /api/v1/emergency-broadcasts/[id]/cancel`.
 *
 * Added alongside Plan A1 drain #71. Covers the contracted runRoute envelope:
 * happy path (wire shape `{data: {canceled: true}}` with service called as
 * `(broadcastId, communityId, userId)` — id FIRST), 409 ConflictError when
 * the undo window has expired, 401 unauth, 400 invalid params.id
 * (non-numeric / zero, separate cases), 400 missing body communityId,
 * 403 demo-grace, 403 non-member, 403 permission denied.
 *
 * NOTE: service does NOT accept a requestId — no `x-request-id` forwarding
 * test (drain #71 distinction vs. drain #65 dismiss).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  cancelBroadcastMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  cancelBroadcastMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  cancelBroadcast: cancelBroadcastMock,
}));

import { POST } from '../../src/app/api/v1/emergency-broadcasts/[id]/cancel/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/emergency-broadcasts/${id}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/emergency-broadcasts/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    cancelBroadcastMock.mockResolvedValue(true);
  });

  it('cancels a broadcast and returns {data: {canceled: true}}', async () => {
    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { canceled: true } };
    expect(json.data.canceled).toBe(true);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'emergency_broadcasts',
      'write',
    );
    // Service signature: cancelBroadcast(broadcastId, communityId, userId) — id FIRST.
    expect(cancelBroadcastMock).toHaveBeenCalledWith(99, 42, 'user-admin-1');
  });

  it('returns 409 CONFLICT when the undo window has expired', async () => {
    cancelBroadcastMock.mockResolvedValueOnce(false);

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('CONFLICT');
    expect(json.error.message).toBe(
      'Undo window has expired. Broadcast cannot be canceled.',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(401);
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42 }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(99, {}), routeCtx('99'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 403 when emergency_broadcasts.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(cancelBroadcastMock).not.toHaveBeenCalled();
  });
});
