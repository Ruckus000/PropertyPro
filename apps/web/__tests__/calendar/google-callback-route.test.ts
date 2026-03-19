import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermissionMock,
  validateOAuthStateMock,
  completeGoogleCalendarConnectMock,
  parseCommunityIdFromQueryOrHeaderMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncWritePermissionMock: vi.fn(),
  validateOAuthStateMock: vi.fn(),
  completeGoogleCalendarConnectMock: vi.fn(),
  parseCommunityIdFromQueryOrHeaderMock: vi.fn(),
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
  validateOAuthState: validateOAuthStateMock,
  completeGoogleCalendarConnect: completeGoogleCalendarConnectMock,
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

vi.mock('@/lib/calendar/request', () => ({
  parseCommunityIdFromQueryOrHeader: parseCommunityIdFromQueryOrHeaderMock,
}));

import { GET } from '../../src/app/api/v1/calendar/google/callback/route';

describe('Google Calendar callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    parseCommunityIdFromQueryOrHeaderMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      communityType: 'condo_718',
      permissions: { resources: { calendar_sync: { read: true, write: true } } },
    });
    requireCalendarSyncEnabledForMembershipMock.mockReturnValue(undefined);
    requireCalendarSyncWritePermissionMock.mockReturnValue(undefined);
    validateOAuthStateMock.mockReturnValue(undefined);
  });

  it('completes the OAuth flow and returns 200', async () => {
    completeGoogleCalendarConnectMock.mockResolvedValue({ connected: true });

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/calendar/google/callback?communityId=42&code=auth-code&state=valid-state',
        { headers: { 'x-request-id': 'test-123' } },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ connected: true });
    expect(validateOAuthStateMock).toHaveBeenCalledWith('valid-state', 42, 'session-user-1');
    expect(completeGoogleCalendarConnectMock).toHaveBeenCalledWith(
      42,
      'session-user-1',
      'auth-code',
      'test-123',
    );
  });

  it('returns 400 when code query parameter is missing', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/calendar/google/callback?communityId=42&state=valid-state',
      ),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when OAuth state is invalid', async () => {
    validateOAuthStateMock.mockImplementation(() => {
      throw new BadRequestError('Invalid OAuth state');
    });

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/calendar/google/callback?communityId=42&code=auth-code&state=bad-state',
      ),
    );

    expect(response.status).toBe(400);
  });

  it('returns 401 when user is not authenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/calendar/google/callback?communityId=42&code=auth-code&state=valid-state',
      ),
    );

    expect(response.status).toBe(401);
  });
});
