/**
 * Route unit tests — `POST /api/v1/reservations/[id]/cancel`.
 *
 * Added alongside Plan A1 drain #70. Covers the contracted runRoute envelope:
 * happy paths (admin vs resident canCancelAny flag), 401 unauth, 400 invalid
 * params.id / params.id zero / missing communityId, 403 demo-grace,
 * 403 non-member, 403 amenities-disabled, 403 requirePlanFeature gate,
 * 403 amenities-write-permission, 403 reservation-permission, and
 * x-request-id null forwarding.
 *
 * Exercises async `requirePlanFeature(communityId, 'hasAmenities')` gate
 * (drain #63 precedent) plus the role-derived `canCancelAny` boolean
 * threaded into the service as the 4th positional arg.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
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
  resolveEffectiveCommunityIdMock: vi.fn(),
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

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
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

import { POST } from '../../src/app/api/v1/reservations/[id]/cancel/route';

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

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/reservations/${id}/cancel`,
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

describe('POST /api/v1/reservations/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireAmenitiesWritePermissionMock.mockReturnValue(undefined);
    requireReservationPermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    cancelReservationForCommunityMock.mockResolvedValue(CANCEL_RESULT);
  });

  it('cancels a reservation as an admin (canCancelAny=true)', async () => {
    const res = await POST(
      jsonPost(11, { communityId: 42 }, { 'x-request-id': 'req-abc' }),
      routeCtx('11'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(11);
    expect(json.data.status).toBe('cancelled');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireReservationPermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(isResidentRoleMock).toHaveBeenCalledWith('cam');
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-admin-1',
      true,
      'req-abc',
    );
  });

  it('cancels a reservation as a resident (canCancelAny=false)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);

    const res = await POST(
      jsonPost(11, { communityId: 42 }, { 'x-request-id': 'req-res' }),
      routeCtx('11'),
    );

    expect(res.status).toBe(200);
    expect(isResidentRoleMock).toHaveBeenCalledWith('resident');
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-resident-1',
      false,
      'req-res',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(401);
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(11, {}), routeCtx('11'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities are not enabled for the community', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities are not enabled for this community or plan');
    });

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePlanFeature rejects (plan does not include hasAmenities)', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(requireReservationPermissionMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities.write permission is denied', async () => {
    requireAmenitiesWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireReservationPermissionMock).not.toHaveBeenCalled();
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when reservation permission is denied', async () => {
    requireReservationPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Reservations not allowed');
    });

    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(cancelReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(jsonPost(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(200);
    const call = cancelReservationForCommunityMock.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});
