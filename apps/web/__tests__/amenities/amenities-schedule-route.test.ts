/**
 * Route unit tests — `GET /api/v1/amenities/[id]/schedule`.
 *
 * Added alongside Plan A1 bundle drain #33. Five-gate auth chain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesReadPermissionMock,
  requirePlanFeatureMock,
  getAmenityScheduleForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesReadPermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  getAmenityScheduleForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/work-orders/common', () => ({
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesReadPermission: requireAmenitiesReadPermissionMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/services/work-orders-service', () => ({
  getAmenityScheduleForCommunity: getAmenityScheduleForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/amenities/[id]/schedule/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const SCHEDULE = { amenityId: 5, reservations: [] };

function req(qs = '?communityId=42', id = '5', headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/amenities/${id}/schedule${qs}`, {
    headers: headers ?? {},
  });
}
function ctx(id = '5') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/amenities/[id]/schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireAmenitiesReadPermissionMock.mockReturnValue(undefined);
    getAmenityScheduleForCommunityMock.mockResolvedValue(SCHEDULE);
  });

  it('returns wrapped schedule for a permitted member', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { amenityId: number } };
    expect(json.data.amenityId).toBe(5);
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(getAmenityScheduleForCommunityMock).toHaveBeenCalledWith(42, 5);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(getAmenityScheduleForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(req(''), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(req('?communityId=abc'), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when [id] is non-numeric', async () => {
    const res = await GET(req('?communityId=42', 'abc'), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(req('?communityId=42', '5', { 'x-community-id': '99' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 403 when amenities are disabled', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities not enabled');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getAmenityScheduleForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when plan feature is unavailable', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('Plan does not include amenities'),
    );
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getAmenityScheduleForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when amenities.read permission is denied', async () => {
    requireAmenitiesReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('No amenities read permission');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getAmenityScheduleForCommunityMock).not.toHaveBeenCalled();
  });
});
