import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermissionMock,
  disconnectGoogleCalendarMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncWritePermissionMock: vi.fn(),
  disconnectGoogleCalendarMock: vi.fn(),
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
  disconnectGoogleCalendar: disconnectGoogleCalendarMock,
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (fn: Function) =>
    async (...args: unknown[]) => {
      try {
        return await fn(...args);
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'statusCode' in error && 'toJSON' in error) {
          const { NextResponse } = await import('next/server');
          return NextResponse.json((error as { toJSON: () => unknown }).toJSON(), {
            status: (error as { statusCode: number }).statusCode,
          });
        }
        throw error;
      }
    },
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { DELETE } from '../../src/app/api/v1/calendar/google/disconnect/route';

describe('Google Calendar disconnect route', () => {
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

  it('disconnects Google Calendar and returns 200', async () => {
    disconnectGoogleCalendarMock.mockResolvedValue({ disconnected: true });

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/disconnect', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ disconnected: true });
    expect(disconnectGoogleCalendarMock).toHaveBeenCalledWith(
      42,
      'session-user-1',
      null,
    );
  });

  it('returns 403 when calendar sync is disabled for the community', async () => {
    requireCalendarSyncEnabledForMembershipMock.mockImplementation(() => {
      throw new ForbiddenError('Calendar sync is not enabled for this community type');
    });

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/disconnect', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it('returns 403 when user lacks calendar_sync write permission', async () => {
    requireCalendarSyncWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/v1/calendar/google/disconnect', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
  });
});
