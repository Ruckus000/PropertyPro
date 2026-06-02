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
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
    });
    listOperationsForCommunityMock.mockResolvedValue({
      data: [],
      meta: {
        cursor: null,
        limit: 25,
        partialFailure: false,
        unavailableSources: [],
      },
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

  it('returns 403 when the caller is a resident', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25'),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error?.message ?? json.error).toMatch(/resident/i);
    expect(listOperationsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25'),
    );

    expect(res.status).toBe(401);
    expect(listOperationsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when maintenance read permission is denied', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25'),
    );

    expect(res.status).toBe(403);
    expect(listOperationsForCommunityMock).not.toHaveBeenCalled();
  });

  it('accepts type=reservation and forwards it to listOperationsForCommunity', async () => {
    listOperationsForCommunityMock.mockResolvedValue({
      data: [
        {
          id: 9,
          type: 'reservation',
          title: 'Reservation — Pool',
          status: 'confirmed',
          priority: 'normal',
          unitId: 3,
          createdAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      meta: { cursor: null, limit: 25, partialFailure: false, unavailableSources: [] },
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25&type=reservation'),
    );

    expect(res.status).toBe(200);
    expect(listOperationsForCommunityMock).toHaveBeenCalledWith(42, expect.objectContaining({
      type: 'reservation',
    }));
  });
});
