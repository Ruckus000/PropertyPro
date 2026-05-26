/**
 * Route unit tests — `PATCH /api/v1/amenities/[id]`.
 *
 * Added alongside Plan A1 drain #75. Covers the contracted runRoute envelope:
 * happy paths (full body, nested bookingRules, partial body), 401 unauth,
 * 400 invalid params.id / params.id zero / missing communityId / invalid
 * bookingRules date format, 403 demo-grace, 403 non-member, 403 amenities-
 * disabled, 403 requirePlanFeature gate, 403 amenities-write-permission,
 * 403 amenity-admin-write, and x-request-id null forwarding.
 *
 * Exercises async `requirePlanFeature(communityId, 'hasAmenities')` gate
 * (drain #70 precedent) plus the canonical OBJECT 4th positional arg shape.
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
  requireAmenityAdminWriteMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  updateAmenityForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesWritePermissionMock: vi.fn(),
  requireAmenityAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  updateAmenityForCommunityMock: vi.fn(),
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
  requireAmenityAdminWrite: requireAmenityAdminWriteMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  updateAmenityForCommunity: updateAmenityForCommunityMock,
}));

import { PATCH } from '../../src/app/api/v1/amenities/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const UPDATE_RESULT = {
  id: 7,
  name: 'Pool',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPatch(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/amenities/${id}`,
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

describe('PATCH /api/v1/amenities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireAmenitiesWritePermissionMock.mockReturnValue(undefined);
    requireAmenityAdminWriteMock.mockReturnValue(undefined);
    updateAmenityForCommunityMock.mockResolvedValue(UPDATE_RESULT);
  });

  it('updates an amenity with a full body', async () => {
    const res = await PATCH(
      jsonPatch(
        7,
        {
          communityId: 42,
          name: 'Pool',
          description: 'Heated pool',
          location: 'Building A',
          capacity: 25,
          isBookable: true,
        },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; name: string } };
    expect(json.data.id).toBe(7);
    expect(json.data.name).toBe('Pool');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAmenityAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(updateAmenityForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      {
        name: 'Pool',
        description: 'Heated pool',
        location: 'Building A',
        capacity: 25,
        isBookable: true,
        bookingRules: undefined,
      },
      'req-abc',
    );
  });

  it('updates an amenity with a nested bookingRules object', async () => {
    const bookingRules = {
      minDurationMinutes: 30,
      maxDurationMinutes: 240,
      advanceBookingDays: 14,
      blackoutDates: ['2026-07-04', '2026-12-25'],
    };

    const res = await PATCH(
      jsonPatch(
        7,
        { communityId: 42, name: 'Pool', bookingRules },
        { 'x-request-id': 'req-br' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(updateAmenityForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      {
        name: 'Pool',
        description: undefined,
        location: undefined,
        capacity: undefined,
        isBookable: undefined,
        bookingRules,
      },
      'req-br',
    );
  });

  it('updates an amenity with a partial body (only name)', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, name: 'Pool' }, { 'x-request-id': 'req-p' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(updateAmenityForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      {
        name: 'Pool',
        description: undefined,
        location: undefined,
        capacity: undefined,
        isBookable: undefined,
        bookingRules: undefined,
      },
      'req-p',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await PATCH(jsonPatch('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(jsonPatch('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await PATCH(jsonPatch(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when bookingRules.blackoutDates is in the wrong format', async () => {
    const res = await PATCH(
      jsonPatch(7, {
        communityId: 42,
        bookingRules: { blackoutDates: ['2026/01/01'] },
      }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireAmenitiesEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities are not enabled for the community', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities are not enabled for this community or plan');
    });

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePlanFeature rejects (plan does not include hasAmenities)', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).not.toHaveBeenCalled();
    expect(requireAmenityAdminWriteMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities.write permission is denied', async () => {
    requireAmenitiesWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireAmenityAdminWriteMock).not.toHaveBeenCalled();
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenity-admin-write is denied', async () => {
    requireAmenityAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Admin write required');
    });

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(updateAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(200);
    const call = updateAmenityForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});
