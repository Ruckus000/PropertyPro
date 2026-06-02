/**
 * Route unit tests — GET /api/v1/admin/join-requests.
 *
 * Plan A1 drain #172.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  listPendingJoinRequestsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  listPendingJoinRequestsForCommunityMock: vi.fn(),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/join-requests/approve-request', () => ({
  listPendingJoinRequestsForCommunity: listPendingJoinRequestsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/admin/join-requests/route';

const MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const ROW = {
  id: 1,
  userId: 'user-pending',
  communityId: 42,
  unitIdentifier: '101',
  residentType: 'owner',
  status: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('GET /api/v1/admin/join-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    listPendingJoinRequestsForCommunityMock.mockResolvedValue([ROW]);
  });

  it('returns pending join requests for the header tenant', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/admin/join-requests', {
        headers: { 'x-community-id': '42' },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.any(Request), null);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'residents', 'write');
    expect(listPendingJoinRequestsForCommunityMock).toHaveBeenCalledWith(42);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/admin/join-requests'),
    );

    expect(res.status).toBe(401);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(listPendingJoinRequestsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership check fails', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Forbidden'));

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/admin/join-requests'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(listPendingJoinRequestsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when residents.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/admin/join-requests'),
    );

    expect(res.status).toBe(403);
    expect(listPendingJoinRequestsForCommunityMock).not.toHaveBeenCalled();
  });
});
