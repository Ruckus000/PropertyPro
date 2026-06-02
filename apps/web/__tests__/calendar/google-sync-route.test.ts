import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermissionMock,
  syncGoogleCalendarMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncWritePermissionMock: vi.fn(),
  syncGoogleCalendarMock: vi.fn(),
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
  syncGoogleCalendar: syncGoogleCalendarMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../../src/app/api/v1/calendar/google/sync/route';

describe('Google Calendar sync route', () => {
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

  it('triggers a Google Calendar sync and returns sync stats', async () => {
    syncGoogleCalendarMock.mockResolvedValue({
      syncedCount: 3,
      syncedAt: '2026-06-01T12:00:00.000Z',
      syncToken: 'token-abc',
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-456' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      syncedCount: 3,
      syncedAt: '2026-06-01T12:00:00.000Z',
      syncToken: 'token-abc',
    });
    expect(requireCalendarSyncEnabledForMembershipMock).toHaveBeenCalled();
    expect(requireCalendarSyncWritePermissionMock).toHaveBeenCalled();
    expect(syncGoogleCalendarMock).toHaveBeenCalledWith(42, 'session-user-1', 'req-456');
  });

  it('returns 401 without calling sync when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(401);
    expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
    expect(requireCalendarSyncEnabledForMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 403 when calendar sync is disabled for the community', async () => {
    requireCalendarSyncEnabledForMembershipMock.mockImplementation(() => {
      throw new ForbiddenError('Calendar sync is not enabled for this community type');
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks calendar_sync write permission', async () => {
    requireCalendarSyncWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without calling sync', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 'not-a-number' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });
});
