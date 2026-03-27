import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  cancelReservationForCommunityMock,
  assertNotDemoGraceMock,
  isResidentRoleMock,
  requireAmenitiesEnabledMock,
  requireAmenitiesWritePermissionMock,
  requireReservationPermissionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  cancelReservationForCommunityMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  isResidentRoleMock: vi.fn((role: string) => role === 'owner' || role === 'tenant'),
  requireAmenitiesEnabledMock: vi.fn(),
  requireAmenitiesWritePermissionMock: vi.fn(),
  requireReservationPermissionMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  isResidentRole: isResidentRoleMock,
  requireAmenitiesEnabled: requireAmenitiesEnabledMock,
  requireAmenitiesWritePermission: requireAmenitiesWritePermissionMock,
  requireReservationPermission: requireReservationPermissionMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  cancelReservationForCommunity: cancelReservationForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/reservations/[id]/cancel/route';

describe('reservation cancel route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'owner',
      communityType: 'apartment',
      isUnitOwner: true,
      isAdmin: false,
    });
    cancelReservationForCommunityMock.mockResolvedValue({
      id: 77,
      status: 'cancelled',
    });
  });

  it('cancels the reservation through the canonical POST route', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/reservations/77/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: '77' }) });

    expect(res.status).toBe(200);
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(42, 77, 'user-1', false, null);
    expect(requireAmenitiesEnabledMock).toHaveBeenCalledTimes(1);
    expect(requireAmenitiesWritePermissionMock).toHaveBeenCalledTimes(1);
    expect(requireReservationPermissionMock).toHaveBeenCalledTimes(1);
  });

  it('lets admins cancel any reservation', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_president',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/reservations/77/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: '77' }) });

    expect(res.status).toBe(200);
    expect(cancelReservationForCommunityMock).toHaveBeenCalledWith(42, 77, 'user-1', true, null);
  });
});
