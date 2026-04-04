import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { generateMyMeetingsSubscriptionToken } from '../../src/lib/calendar/subscription-token';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncReadPermissionMock,
  generateMyCalendarIcsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncReadPermissionMock: vi.fn(),
  generateMyCalendarIcsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/calendar/common', () => ({
  requireCalendarSyncEnabledForMembership: requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncReadPermission: requireCalendarSyncReadPermissionMock,
}));

vi.mock('@/lib/services/calendar-sync-service', () => ({
  generateMyCalendarIcs: generateMyCalendarIcsMock,
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

import { GET } from '../../src/app/api/v1/calendar/my-meetings.ics/route';

describe('my-meetings ICS route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OAUTH_STATE_SECRET', 'calendar-secret');
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      communityType: 'condo_718',
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      permissions: { resources: { calendar_sync: { read: true, write: false } } },
      timezone: 'America/New_York',
    });
    requireCalendarSyncEnabledForMembershipMock.mockReturnValue(undefined);
    requireCalendarSyncReadPermissionMock.mockReturnValue(undefined);
    generateMyCalendarIcsMock.mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the active session when one is available', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/calendar/my-meetings.ics?communityId=42'),
    );

    expect(response.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'session-user-1');
    expect(generateMyCalendarIcsMock).toHaveBeenCalled();
  });

  it('accepts a signed subscription token when there is no session', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const token = generateMyMeetingsSubscriptionToken({
      communityId: 42,
      userId: 'token-user-1',
    });

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/v1/calendar/my-meetings.ics?communityId=42&token=${encodeURIComponent(token)}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'token-user-1');
    expect(generateMyCalendarIcsMock).toHaveBeenCalledWith(
      42,
      'token-user-1',
      expect.objectContaining({ communityId: 42 }),
    );
  });

  it('returns 401 when neither a session nor a valid token is present', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/calendar/my-meetings.ics?communityId=42&token=bad-token',
      ),
    );

    expect(response.status).toBe(401);
  });
});
