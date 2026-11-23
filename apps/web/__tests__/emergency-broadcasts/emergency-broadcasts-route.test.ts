/**
 * Route unit tests — `GET` and `POST /api/v1/emergency-broadcasts`.
 *
 * Plan A1 drain #114.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
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

  it('limits a non-manager (owner, incl. a board seat) to broadcasts sent to them', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...MEMBERSHIP,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      designation: 'board_member',
    });

    const res = await GET(
      new NextRequest(
        `http://localhost:3000/api/v1/emergency-broadcasts?communityId=${COMMUNITY_ID}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(paginateEmergencyBroadcastsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: undefined,
      pageSize: undefined,
      recipientUserId: USER_ID,
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

  it('without scheduledFor, calls createBroadcast exactly as before (no scheduling key)', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { broadcastId: 5, recipientCount: 10, smsEligibleCount: 8, emailCount: 10 },
    });
    expect(createBroadcastMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(createBroadcastMock.mock.calls[0]![0]).sort()).toEqual([
      'body',
      'channels',
      'communityId',
      'initiatedBy',
      'severity',
      'smsAllowed',
      'smsBody',
      'targetAudience',
      'templateKey',
      'title',
    ]);
  });

  it('with scheduledFor, schedules: passes the time as a Date and returns scheduledFor', async () => {
    const scheduledFor = '2026-12-01T09:00:00-05:00';
    createBroadcastMock.mockResolvedValue({
      broadcastId: 6,
      recipientCount: 10,
      smsEligibleCount: 0,
      emailCount: 10,
      scheduledFor: '2026-12-01T14:00:00.000Z',
    });

    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, scheduledFor }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      broadcastId: 6,
      recipientCount: 10,
      smsEligibleCount: 0,
      emailCount: 10,
      scheduledFor: '2026-12-01T14:00:00.000Z',
    });
    expect(createBroadcastMock.mock.calls[0]![0].scheduledFor).toEqual(new Date(scheduledFor));
    // Auth chain order is unchanged: demo-grace before membership, then permission.
    expect(assertNotDemoGraceMock.mock.invocationCallOrder[0]!).toBeLessThan(
      requireCommunityMembershipMock.mock.invocationCallOrder[0]!,
    );
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'emergency_broadcasts', 'write');
  });

  it('refuses a scheduled broadcast in the demo grace window before touching the service', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo has ended'));

    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, scheduledFor: '2026-12-01T09:00:00Z' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createBroadcastMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for a scheduledFor that is not an ISO time with an offset', async () => {
    for (const scheduledFor of ['tomorrow at 9', '2026-12-01T09:00:00']) {
      const res = await POST(
        new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
          method: 'POST',
          body: JSON.stringify({ ...validPayload, scheduledFor }),
          headers: { 'content-type': 'application/json' },
        }),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    }
    expect(createBroadcastMock).not.toHaveBeenCalled();
  });
});
