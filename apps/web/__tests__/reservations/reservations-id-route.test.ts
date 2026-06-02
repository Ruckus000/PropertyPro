/**
 * Route unit tests — `DELETE /api/v1/reservations/[id]`.
 *
 * Plan A1 drain #121. Mirrors cancel-route.test.ts (#70) — same service
 * and auth chain; DELETE uses query `communityId` instead of body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesWritePermissionMock,
  requireReservationPermissionMock,
  isResidentRoleMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  cancelReservationForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesWritePermissionMock: vi.fn(),
  requireReservationPermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  cancelReservationForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesWritePermission: requireAmenitiesWritePermissionMock,
  requireReservationPermission: requireReservationPermissionMock,
  isResidentRole: isResidentRoleMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  cancelReservationForCommunity: cancelReservationForCommunityMock,
}));

import { DELETE } from '../../src/app/api/v1/reservations/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Resident',
  communityType: 'condo_718' as const,
};

const CANCEL_RESULT = {
  id: 11,
  status: 'cancelled',
  cancelledAt: new Date('2026-01-01T00:00:00Z'),
};

function buildDeleteReq(id: string | number, qs = '?communityId=42'): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/reservations/${id}${qs}`,
    { method: 'DELETE', headers: { 'x-request-id': 'req-abc' } },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/v1/reservations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireAmenitiesWritePermissionMock.mockReturnValue(undefined);
    requireReservationPermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    cancelReservationForCommunityMock.mockResolvedValue(CANCEL_RESULT);
  });

  it('cancels a reservation as admin (canCancelAny=true)', async () => {
    const res = await DELETE(buildDeleteReq(11), routeCtx('11'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(11);
    expect(parseCommunityIdFromQueryMock).toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-admin-1',
      true,
      'req-abc',
    );
  });

  it('cancels as resident (canCancelAny=false)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);

    const res = await DELETE(buildDeleteReq(11), routeCtx('11'));

    expect(res.status).toBe(200);
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-resident-1',
      false,
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(buildDeleteReq(11), routeCtx('11'));

    expect(res.status).toBe(401);
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities gate throws', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities disabled');
    });

    const res = await DELETE(buildDeleteReq(11), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid reservation id', async () => {
    const res = await DELETE(buildDeleteReq(11), routeCtx('0'));

    expect(res.status).toBe(400);
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });
});
