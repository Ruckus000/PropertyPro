/**
 * Route unit tests — `PATCH /api/v1/visitors/[id]/checkout`.
 *
 * Added alongside Plan A1 drain #66. Covers the contracted runRoute envelope:
 * happy path, 401 unauth, 400 invalid params.id / missing-communityId,
 * 403 demo-grace / non-member / visitor-logging-disabled / visitors-write
 * permission denied / staff-operator gate, and x-request-id null forwarding.
 *
 * NOTE: HTTP method is PATCH (not POST). The staff-operator gate runs LAST
 * in the auth chain (after permission), per the pre-migration source.
 * Mirrors the checkin sibling (drain #53) test file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermissionMock,
  requireStaffOperatorMock,
  assertNotDemoGraceMock,
  checkOutVisitorForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsWritePermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  checkOutVisitorForCommunityMock: vi.fn(),
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

vi.mock('@/lib/logistics/common', () => ({
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermission: requireVisitorsWritePermissionMock,
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  checkOutVisitorForCommunity: checkOutVisitorForCommunityMock,
}));

import { PATCH } from '../../src/app/api/v1/visitors/[id]/checkout/route';

const STAFF_MEMBERSHIP = {
  userId: 'user-staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const CHECKOUT_RESULT = {
  id: 99,
  visitorId: 7,
  checkedOutAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPatch(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/visitors/${id}/checkout`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/v1/visitors/[id]/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsWritePermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    checkOutVisitorForCommunityMock.mockResolvedValue(CHECKOUT_RESULT);
  });

  it('checks out the visitor (happy path)', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42 }, { 'x-request-id': 'req-abc' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; visitorId: number } };
    expect(json.data.id).toBe(99);
    expect(json.data.visitorId).toBe(7);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-staff-1');
    expect(requireVisitorLoggingEnabledMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireVisitorsWritePermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireStaffOperatorMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(checkOutVisitorForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-staff-1',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await PATCH(jsonPatch('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(jsonPatch('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await PATCH(jsonPatch(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(requireVisitorsWritePermissionMock).not.toHaveBeenCalled();
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled for the community', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireVisitorsWritePermissionMock).not.toHaveBeenCalled();
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitors.write permission is denied', async () => {
    requireVisitorsWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a staff operator', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff operator required');
    });

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(checkOutVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(200);
    const call = checkOutVisitorForCommunityMock.mock.calls[0];
    expect(call[3]).toBeNull();
  });
});
