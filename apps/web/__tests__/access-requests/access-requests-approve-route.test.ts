/**
 * Route unit tests — POST /api/v1/access-requests/[id]/approve.
 *
 * Added alongside Plan A1 drain #39. Pre-existing coverage in
 * `access-requests/route.test.ts` only asserts happy paths; this file adds
 * the full auth-chain + validation matrix the migration to `runRoute()`
 * unlocks (canonical `VALIDATION_ERROR` envelope for invalid params/body,
 * demo-grace short-circuit, 401/403 ordering).
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
  approveAccessRequestMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  approveAccessRequestMock: vi.fn(),
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

vi.mock('@/lib/services/access-request-service', () => ({
  approveAccessRequest: approveAccessRequestMock,
}));

import { POST } from '../../src/app/api/v1/access-requests/[id]/approve/route';

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
    `http://localhost:3000/api/v1/access-requests/${id}/approve`,
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

describe('POST /api/v1/access-requests/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    approveAccessRequestMock.mockResolvedValue({ userId: 'new-user-uuid' });
  });

  it('approves the request and returns the new userId (happy path with unitId)', async () => {
    const res = await POST(jsonPost(5, { unitId: 7 }), routeCtx('5'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { userId: string } };
    expect(json.data).toEqual({ userId: 'new-user-uuid' });
    expect(approveAccessRequestMock).toHaveBeenCalledWith({
      requestId: 5,
      communityId: 42,
      reviewerId: 'user-admin-1',
      unitId: 7,
    });
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'residents',
      'write',
    );
  });

  it('approves without unitId when body omits the field (optional)', async () => {
    const res = await POST(jsonPost(5, {}), routeCtx('5'));

    expect(res.status).toBe(200);
    expect(approveAccessRequestMock).toHaveBeenCalledWith({
      requestId: 5,
      communityId: 42,
      reviewerId: 'user-admin-1',
      unitId: undefined,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(5, {}), routeCtx('5'));

    expect(res.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(5, {}), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(5, {}), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks residents.write permission', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(5, {}), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', {}), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', {}), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body unitId is zero (positive constraint)', async () => {
    const res = await POST(jsonPost(5, { unitId: 0 }), routeCtx('5'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body unitId is non-integer', async () => {
    const res = await POST(jsonPost(5, { unitId: 3.5 }), routeCtx('5'));

    expect(res.status).toBe(400);
    expect(approveAccessRequestMock).not.toHaveBeenCalled();
  });
});
