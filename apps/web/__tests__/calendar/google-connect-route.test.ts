import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermissionMock,
  initiateGoogleCalendarConnectMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncWritePermissionMock: vi.fn(),
  initiateGoogleCalendarConnectMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/calendar/common', () => ({
  requireCalendarSyncEnabledForMembership: requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermission: requireCalendarSyncWritePermissionMock,
}));

vi.mock('@/lib/services/calendar-sync-service', () => ({
  initiateGoogleCalendarConnect: initiateGoogleCalendarConnectMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../../src/app/api/v1/calendar/google/connect/route';

describe('POST /api/v1/calendar/google/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    parseCommunityIdFromBodyMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      communityType: 'condo_718',
      permissions: { resources: { calendar_sync: { read: true, write: true } } },
    });
    requireCalendarSyncEnabledForMembershipMock.mockReturnValue(undefined);
    requireCalendarSyncWritePermissionMock.mockReturnValue(undefined);
  });

  it('initiates Google Calendar connect and returns authorization URL', async () => {
    initiateGoogleCalendarConnectMock.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?...',
      state: 'oauth-state-token',
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      data: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?...',
        state: 'oauth-state-token',
      },
    });
    expect(initiateGoogleCalendarConnectMock).toHaveBeenCalledWith(42, 'session-user-1');
    expect(requireCalendarSyncWritePermissionMock).toHaveBeenCalled();
  });

  it('returns 403 when calendar sync is disabled for the community', async () => {
    requireCalendarSyncEnabledForMembershipMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Calendar sync is not enabled for this community type');
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(initiateGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks calendar_sync write permission', async () => {
    requireCalendarSyncWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(initiateGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not initiate connect', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(401);
    expect(initiateGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });
});
