/**
 * Route unit tests — `GET` and `POST /api/v1/emergency-broadcasts`.
 *
 * Plan A1 drain #114.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  createBroadcastMock,
  paginateEmergencyBroadcastsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  createBroadcastMock: vi.fn(),
  paginateEmergencyBroadcastsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  createBroadcast: createBroadcastMock,
  paginateEmergencyBroadcasts: paginateEmergencyBroadcastsMock,
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

import { GET, POST } from '../../src/app/api/v1/emergency-broadcasts/route';

const COMMUNITY_ID = 100;
const USER_ID = 'user-1';

const MEMBERSHIP = {
  userId: USER_ID,
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  permissions: {
    resources: {
      emergency_broadcasts: { read: true, write: true },
    },
  },
};

describe('GET /api/v1/emergency-broadcasts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    paginateEmergencyBroadcastsMock.mockResolvedValue({
      data: [{ id: 1, title: 'Alert' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns paginated broadcasts', async () => {
    const res = await GET(
      new NextRequest(
        `http://localhost:3000/api/v1/emergency-broadcasts?communityId=${COMMUNITY_ID}`,
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.data).toHaveLength(1);
    expect(paginateEmergencyBroadcastsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest(
        `http://localhost:3000/api/v1/emergency-broadcasts?communityId=${COMMUNITY_ID}`,
      ),
    );

    expect(res.status).toBe(401);
    expect(paginateEmergencyBroadcastsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/emergency-broadcasts', () => {
  const validPayload = {
    communityId: COMMUNITY_ID,
    title: 'Gas Leak Alert',
    body: 'Evacuate immediately.',
    severity: 'emergency' as const,
    targetAudience: 'all' as const,
    channels: ['sms', 'email'] as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    createBroadcastMock.mockResolvedValue({
      broadcastId: 5,
      recipientCount: 10,
      smsEligibleCount: 8,
      emailCount: 10,
    });
  });

  it('creates broadcast and wraps response in data envelope', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.broadcastId).toBe(5);
    expect(createBroadcastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: COMMUNITY_ID,
        initiatedBy: USER_ID,
      }),
    );
  });
});
