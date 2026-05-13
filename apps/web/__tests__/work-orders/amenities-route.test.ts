import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesReadPermissionMock,
  requirePlanFeatureMock,
  paginateAmenitiesForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesReadPermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  paginateAmenitiesForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  requireAmenityAdminWrite: vi.fn(),
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesReadPermission: requireAmenitiesReadPermissionMock,
  requireAmenitiesWritePermission: vi.fn(),
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn(),
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  createAmenityForCommunity: vi.fn(),
  paginateAmenitiesForCommunity: paginateAmenitiesForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/amenities/route';

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

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  paginateAmenitiesForCommunityMock.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
});

describe('amenities route GET', () => {
  it('returns the canonical paginated double-wrapped envelope', async () => {
    paginateAmenitiesForCommunityMock.mockResolvedValueOnce({
      data: [{ id: 1, name: 'Clubhouse' }],
      pagination: { nextCursor: 'next', hasMore: true, pageSize: 1 },
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&pageSize=1'));
    const json = (await res.json()) as {
      data: {
        data: Array<{ id: number }>;
        pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
      };
    };

    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledWith(membership);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasAmenities');
    expect(requireAmenitiesReadPermissionMock).toHaveBeenCalledWith(membership);
    expect(paginateAmenitiesForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: undefined,
      pageSize: 1,
    });
    expect(json).toEqual({
      data: {
        data: [{ id: 1, name: 'Clubhouse' }],
        pagination: { nextCursor: 'next', hasMore: true, pageSize: 1 },
      },
    });
  });

  it('passes cursor and pageSize to the ordered-keyset service', async () => {
    await GET(
      new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&cursor=abc123&pageSize=2'),
    );

    expect(paginateAmenitiesForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: 'abc123',
      pageSize: 2,
    });
  });

  it('treats empty cursor and pageSize query params as missing', async () => {
    await GET(
      new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&cursor=&pageSize='),
    );

    expect(paginateAmenitiesForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('rejects invalid pageSize before calling the service', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/amenities?communityId=42&pageSize=abc'),
    );

    expect(res.status).toBe(400);
    expect(paginateAmenitiesForCommunityMock).not.toHaveBeenCalled();
  });
});
