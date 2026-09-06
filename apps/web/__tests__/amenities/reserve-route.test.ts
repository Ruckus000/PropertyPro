/**
 * Route unit tests — `POST /api/v1/amenities/[id]/reserve`.
 *
 * Added alongside Plan A1 drain #78. Covers the contracted runRoute envelope:
 *   - happy paths (admin with unitId, admin with null unitId,
 *     resident with matching unitId, resident with null unitId)
 *   - 403 ForbiddenError when a resident attempts to reserve another unit
 *     (B1 Slice 5 inline-error → ForbiddenError migration)
 *   - 401 unauth
 *   - 400 invalid params.id / params.id zero
 *   - 400 missing communityId / startTime / endTime
 *   - 400 malformed startTime
 *   - 400 notes > 5000 chars
 *   - 403 demo-grace / non-member / amenities-disabled /
 *     requirePlanFeature gate / amenities-write permission /
 *     reservation-permission
 *   - x-request-id null forwarding (4th positional arg → index [3])
 *
 * Exercises async `requirePlanFeature(communityId, 'hasAmenities')` gate
 * (drain #63/#70 precedent) plus the in-handler scoped DB call
 * (`createScopedClient` + `getActorUnitIds`/`requireActorUnitId`)
 * conditional on `isResidentRole(membership.role)` (drain #61 precedent).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const SCOPED_SENTINEL = { __scoped: 'sentinel' };

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesWritePermissionMock,
  requireReservationPermissionMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  requireActorUnitIdMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  createReservationForCommunityMock,
  createScopedClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesWritePermissionMock: vi.fn(),
  requireReservationPermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  requireActorUnitIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  createReservationForCommunityMock: vi.fn(),
  createScopedClientMock: vi.fn(),
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
  getActorUnitIds: getActorUnitIdsMock,
  requireActorUnitId: requireActorUnitIdMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  createReservationForCommunity: createReservationForCommunityMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

import { POST } from '../../src/app/api/v1/amenities/[id]/reserve/route';

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
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const RESERVATION_RESULT = {
  id: 11,
  amenityId: 7,
  unitId: 5,
  startTime: new Date('2026-06-01T12:00:00Z'),
  endTime: new Date('2026-06-01T13:00:00Z'),
};

const VALID_BODY = {
  communityId: 42,
  startTime: '2026-06-01T12:00:00+00:00',
  endTime: '2026-06-01T13:00:00+00:00',
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/amenities/${id}/reserve`,
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

describe('POST /api/v1/amenities/[id]/reserve', () => {
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
    getActorUnitIdsMock.mockResolvedValue([]);
    requireActorUnitIdMock.mockResolvedValue(0);
    createScopedClientMock.mockReturnValue(SCOPED_SENTINEL);
    createReservationForCommunityMock.mockResolvedValue(RESERVATION_RESULT);
  });

  it('reserves as ADMIN with explicit unitId (skips resident scoped DB lookup)', async () => {
    const res = await POST(
      jsonPost(7, { ...VALID_BODY, unitId: 5, notes: 'birthday party' }, {
        'x-request-id': 'req-admin',
      }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number } };
    expect(json.data.id).toBe(11);
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
    expect(getActorUnitIdsMock).not.toHaveBeenCalled();
    expect(requireActorUnitIdMock).not.toHaveBeenCalled();
    expect(createScopedClientMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      {
        amenityId: 7,
        unitId: 5,
        startTime: '2026-06-01T12:00:00+00:00',
        endTime: '2026-06-01T13:00:00+00:00',
        notes: 'birthday party',
      },
      'req-admin',
    );
  });

  it('reserves as ADMIN with no unitId (sends unitId: null)', async () => {
    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(getActorUnitIdsMock).not.toHaveBeenCalled();
    expect(requireActorUnitIdMock).not.toHaveBeenCalled();
    expect(createScopedClientMock).not.toHaveBeenCalled();
    const call = createReservationForCommunityMock.mock.calls[0]!;
    expect(call[2]).toEqual({
      amenityId: 7,
      unitId: null,
      startTime: '2026-06-01T12:00:00+00:00',
      endTime: '2026-06-01T13:00:00+00:00',
      notes: null,
    });
  });

  it('reserves as RESIDENT with explicit unitId in actorUnitIds', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    getActorUnitIdsMock.mockResolvedValueOnce([5, 6]);

    const res = await POST(
      jsonPost(7, { ...VALID_BODY, unitId: 5 }, { 'x-request-id': 'req-res' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(getActorUnitIdsMock).toHaveBeenCalledWith(SCOPED_SENTINEL, 'user-resident-1');
    expect(requireActorUnitIdMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-resident-1',
      expect.objectContaining({ amenityId: 7, unitId: 5 }),
      'req-res',
    );
  });

  it('reserves as RESIDENT with null unitId — calls requireActorUnitId and uses returned value', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    getActorUnitIdsMock.mockResolvedValueOnce([5]);
    requireActorUnitIdMock.mockResolvedValueOnce(5);

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(getActorUnitIdsMock).toHaveBeenCalledWith(SCOPED_SENTINEL, 'user-resident-1');
    expect(requireActorUnitIdMock).toHaveBeenCalledWith(SCOPED_SENTINEL, 'user-resident-1');
    expect(createReservationForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-resident-1',
      expect.objectContaining({ amenityId: 7, unitId: 5 }),
      null,
    );
  });

  it('returns 403 ForbiddenError when RESIDENT tries to reserve another unit (B1 Slice 5 migration)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    getActorUnitIdsMock.mockResolvedValueOnce([5]);

    const res = await POST(
      jsonPost(7, { ...VALID_BODY, unitId: 10 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toBe(
      'Residents can only reserve amenities for their own unit',
    );
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', VALID_BODY), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', VALID_BODY), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const { communityId: _drop, ...rest } = VALID_BODY;
    const res = await POST(jsonPost(7, rest), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing startTime', async () => {
    const { startTime: _drop, ...rest } = VALID_BODY;
    const res = await POST(jsonPost(7, rest), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing endTime', async () => {
    const { endTime: _drop, ...rest } = VALID_BODY;
    const res = await POST(jsonPost(7, rest), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when startTime is not a valid ISO datetime with offset', async () => {
    const res = await POST(
      jsonPost(7, { ...VALID_BODY, startTime: 'not-a-date' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when notes exceed 5000 chars', async () => {
    const res = await POST(
      jsonPost(7, { ...VALID_BODY, notes: 'x'.repeat(5001) }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities are not enabled for the community', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities are not enabled for this community or plan');
    });

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePlanFeature rejects (plan does not include hasAmenities)', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(requireReservationPermissionMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities.write permission is denied', async () => {
    requireAmenitiesWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireReservationPermissionMock).not.toHaveBeenCalled();
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when reservation permission is denied', async () => {
    requireReservationPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Reservations not allowed');
    });

    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(createReservationForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(jsonPost(7, VALID_BODY), routeCtx('7'));

    expect(res.status).toBe(200);
    const call = createReservationForCommunityMock.mock.calls[0]!;
    expect(call[3]).toBeNull();
  });
});
