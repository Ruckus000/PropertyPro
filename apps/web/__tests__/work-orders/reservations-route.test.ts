import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  parsePositiveIntMock,
  isResidentRoleMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesReadPermissionMock,
  requirePlanFeatureMock,
  listReservationsForActorMock,
  listReservationsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parsePositiveIntMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesReadPermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  listReservationsForActorMock: vi.fn(),
  listReservationsForCommunityMock: vi.fn(),
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

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: parsePositiveIntMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  isResidentRole: isResidentRoleMock,
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesReadPermission: requireAmenitiesReadPermissionMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  listReservationsForActor: listReservationsForActorMock,
  listReservationsForCommunity: listReservationsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/reservations/route';

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
  ...ADMIN_MEMBERSHIP,
  userId: 'user-resident-1',
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Resident',
};

const RESERVATION_ITEM = {
  id: 11,
  communityId: 42,
  amenityId: 2,
  userId: 'user-resident-1',
  unitId: 7,
  startTime: new Date('2026-05-05T10:00:00.000Z'),
  endTime: new Date('2026-05-05T11:00:00.000Z'),
  status: 'confirmed' as const,
  notes: 'Pool lane',
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  updatedAt: new Date('2026-05-01T11:00:00.000Z'),
};

describe('GET /api/v1/reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    parsePositiveIntMock.mockImplementation((value: string) => Number(value));
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAmenitiesEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireAmenitiesReadPermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    listReservationsForActorMock.mockResolvedValue([]);
    listReservationsForCommunityMock.mockResolvedValue({
      data: [RESERVATION_ITEM],
      total: 1,
    });
  });

  it('preserves auth and guard ordering, plus admin service call shape', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/reservations?communityId=42&limit=250'),
    );

    expect(res.status).toBe(200);
    expect(listReservationsForCommunityMock).toHaveBeenCalledWith(42, {
      page: 1,
      limit: 100,
    });
    expect(listReservationsForActorMock).not.toHaveBeenCalled();

    const authOrder = requireAuthenticatedUserIdMock.mock.invocationCallOrder[0]!;
    const communityOrder = parseCommunityIdFromQueryMock.mock.invocationCallOrder[0]!;
    const membershipOrder = requireCommunityMembershipMock.mock.invocationCallOrder[0]!;
    const amenitiesEnabledOrder = requireAmenitiesEnabledMock.mock.invocationCallOrder[0]!;
    const planGateOrder = requirePlanFeatureMock.mock.invocationCallOrder[0]!;
    const readPermissionOrder = requireAmenitiesReadPermissionMock.mock.invocationCallOrder[0]!;

    expect(authOrder).toBeLessThan(communityOrder);
    expect(communityOrder).toBeLessThan(membershipOrder);
    expect(membershipOrder).toBeLessThan(amenitiesEnabledOrder);
    expect(amenitiesEnabledOrder).toBeLessThan(planGateOrder);
    expect(planGateOrder).toBeLessThan(readPermissionOrder);

    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; meta: { page: number; limit: number; total: number } };
    };
    expect(json.data.meta).toEqual({ page: 1, limit: 100, total: 1 });
    expect(json.data.data[0]?.id).toBe(11);
  });

  it('preserves resident branch slicing behavior', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    listReservationsForActorMock.mockResolvedValueOnce([
      { ...RESERVATION_ITEM, id: 21 },
      { ...RESERVATION_ITEM, id: 22 },
      { ...RESERVATION_ITEM, id: 23 },
    ]);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/reservations?communityId=42&page=2&limit=1'),
    );

    expect(res.status).toBe(200);
    expect(listReservationsForActorMock).toHaveBeenCalledWith(42, 'user-resident-1');
    expect(listReservationsForCommunityMock).not.toHaveBeenCalled();

    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; meta: { page: number; limit: number; total: number } };
    };
    expect(json.data.meta).toEqual({ page: 2, limit: 1, total: 3 });
    expect(json.data.data.map((row) => row.id)).toEqual([22]);
  });
});
