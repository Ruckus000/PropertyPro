import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  listOperationsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  listOperationsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/operations-service', () => ({
  listOperationsForCommunity: listOperationsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/operations/route';

describe('operations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
    });
  });

  it('returns 200 with partial failure metadata when one source is unavailable', async () => {
    listOperationsForCommunityMock.mockResolvedValue({
      data: [
        {
          id: 77,
          type: 'maintenance_request',
          title: 'Leaky faucet',
          status: 'submitted',
          priority: 'medium',
          unitId: 9,
          createdAt: '2026-03-27T14:00:00.000Z',
        },
      ],
      meta: {
        cursor: null,
        limit: 25,
        partialFailure: true,
        unavailableSources: ['work_order'],
      },
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25'));

    expect(res.status).toBe(200);
    expect(listOperationsForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: undefined,
      limit: 25,
      type: undefined,
      status: undefined,
      priority: undefined,
      unitId: undefined,
    });
    expect(requirePermissionMock).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when every operations source is unavailable', async () => {
    listOperationsForCommunityMock.mockResolvedValue({
      data: [],
      meta: {
        cursor: null,
        limit: 25,
        partialFailure: true,
        unavailableSources: ['maintenance_request', 'work_order'],
      },
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25'));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error.code).toBe('OPERATIONS_UNAVAILABLE');
  });
});
