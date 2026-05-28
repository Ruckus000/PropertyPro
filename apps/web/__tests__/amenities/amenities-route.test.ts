import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesReadPermissionMock,
  requireAmenitiesWritePermissionMock,
  requireAmenityAdminWriteMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
  paginateAmenitiesForCommunityMock,
  createAmenityForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesReadPermissionMock: vi.fn(),
  requireAmenitiesWritePermissionMock: vi.fn(),
  requireAmenityAdminWriteMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  paginateAmenitiesForCommunityMock: vi.fn(),
  createAmenityForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  requireAmenityAdminWrite: requireAmenityAdminWriteMock,
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesReadPermission: requireAmenitiesReadPermissionMock,
  requireAmenitiesWritePermission: requireAmenitiesWritePermissionMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  createAmenityForCommunity: createAmenityForCommunityMock,
  paginateAmenitiesForCommunity: paginateAmenitiesForCommunityMock,
}));

import { GET, POST } from '../../src/app/api/v1/amenities/route';

const membership = {
  userId: 'user-1',
  communityId: 42,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Manager',
  presetKey: 'cam',
  permissions: {
    resources: {
      amenities: { read: true, write: true },
    },
  },
  communityType: 'apartment',
};

const amenityFixture = {
  id: 7,
  communityId: 42,
  name: 'Clubhouse',
  description: 'Main clubhouse',
  location: 'North wing',
  capacity: 50,
  isBookable: true,
  bookingRules: {},
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/amenities', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('/api/v1/amenities route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(membership);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requireAmenitiesReadPermissionMock.mockReturnValue(undefined);
    requireAmenitiesWritePermissionMock.mockReturnValue(undefined);
    requireAmenityAdminWriteMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    paginateAmenitiesForCommunityMock.mockResolvedValue({
      data: [amenityFixture],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
    createAmenityForCommunityMock.mockResolvedValue(amenityFixture);
  });

  it('GET returns paginated amenities data', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&cursor=abc&pageSize=2'),
    );
    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; pagination: { hasMore: boolean; pageSize: number } };
    };

    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(membership);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesReadPermissionMock).toHaveBeenCalledWith(membership);
    expect(paginateAmenitiesForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: 'abc',
      pageSize: 2,
    });
    expect(json.data.pagination.pageSize).toBe(50);
  });

  it('POST creates an amenity', async () => {
    const res = await POST(
      jsonPost(
        {
          communityId: 42,
          name: 'Clubhouse',
          description: 'Main clubhouse',
          location: 'North wing',
          capacity: 50,
          isBookable: true,
          bookingRules: { advanceBookingDays: 7 },
        },
        { 'x-request-id': 'req-123' },
      ),
    );

    expect(res.status).toBe(200);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(membership);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesWritePermissionMock).toHaveBeenCalledWith(membership);
    expect(requireAmenityAdminWriteMock).toHaveBeenCalledWith(membership);
    expect(createAmenityForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-1',
      {
        name: 'Clubhouse',
        description: 'Main clubhouse',
        location: 'North wing',
        capacity: 50,
        isBookable: true,
        bookingRules: { advanceBookingDays: 7 },
      },
      'req-123',
    );
  });

  it('returns 401 for GET when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for POST when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for GET when caller is not community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member of this community'));
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for GET when amenities are disabled', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities are not enabled for this community or plan');
    });
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for GET when plan feature gate denies access', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new ForbiddenError('Plan does not include amenities'));
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for GET when amenities.read permission is denied', async () => {
    requireAmenitiesReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('No amenities read permission');
    });
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST during demo grace lockout', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST when caller is not community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member of this community'));
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST when amenities are disabled', async () => {
    requireAmenitiesEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Amenities are not enabled for this community or plan');
    });
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST when plan feature gate denies access', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new ForbiddenError('Plan does not include amenities'));
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST when amenities.write permission is denied', async () => {
    requireAmenitiesWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for POST when amenity-admin-write is denied', async () => {
    requireAmenityAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Admin write required');
    });
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid GET query params', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&pageSize=abc'),
    );
    const json = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Invalid amenities query');
    expect(paginateAmenitiesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid POST body', async () => {
    const res = await POST(jsonPost({ name: 'Clubhouse' }));
    const json = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Invalid amenity payload');
    expect(createAmenityForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards null x-request-id to service when header missing', async () => {
    const res = await POST(jsonPost({ communityId: 42, name: 'Clubhouse' }));
    expect(res.status).toBe(200);
    const call = createAmenityForCommunityMock.mock.calls[0];
    expect(call[3]).toBeNull();
  });
});
