/**
 * Route unit tests — `GET /api/v1/calendar/google/callback`.
 *
 * Added alongside the Plan A1 drain to runRoute. Covers the contracted
 * envelope: happy path, optional `syncedAt = null` coercion, 401 unauth,
 * 400 missing/whitespace `code`, 400 invalid OAuth state, 403 per auth gate
 * (membership / calendar-sync-disabled / write-permission), and x-request-id
 * null forwarding.
 *
 * Tenancy is resolved via `parseCommunityIdFromQueryOrHeader` (query OR
 * header), so that helper is mocked rather than `resolveEffectiveCommunityId`.
 * The response fixture matches the real service return type
 * `{ provider: 'google'; userId: string; syncedAt: string | null }`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
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

vi.mock('@/lib/calendar/request', () => ({
  parseCommunityIdFromQueryOrHeader: parseCommunityIdFromQueryOrHeaderMock,
}));

vi.mock('@/lib/services/calendar-sync-service', () => ({
  validateOAuthState: validateOAuthStateMock,
  completeGoogleCalendarConnect: completeGoogleCalendarConnectMock,
}));

import { GET } from '../../src/app/api/v1/calendar/google/callback/route';

const MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const CONNECT_RESULT = {
  provider: 'google' as const,
  userId: 'session-user-1',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

function callbackReq(
  query: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/calendar/google/callback${query}`,
    { headers: { ...(headers ?? {}) } },
  );
}

describe('GET /api/v1/calendar/google/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    parseCommunityIdFromQueryOrHeaderMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireCalendarSyncEnabledForMembershipMock.mockReturnValue(undefined);
    requireCalendarSyncWritePermissionMock.mockReturnValue(undefined);
    validateOAuthStateMock.mockReturnValue(undefined);
    completeGoogleCalendarConnectMock.mockResolvedValue(CONNECT_RESULT);
  });

  it('completes the OAuth flow and returns 200 (happy path)', async () => {
    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state', {
        'x-request-id': 'req-abc',
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { provider: string; userId: string; syncedAt: string | null };
    };
    expect(json.data).toEqual(CONNECT_RESULT);
    expect(validateOAuthStateMock).toHaveBeenCalledWith(
      'valid-state',
      42,
      'session-user-1',
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      'session-user-1',
    );
    expect(requireCalendarSyncEnabledForMembershipMock).toHaveBeenCalledWith(
      MEMBERSHIP,
    );
    expect(requireCalendarSyncWritePermissionMock).toHaveBeenCalledWith(
      MEMBERSHIP,
    );
    expect(completeGoogleCalendarConnectMock).toHaveBeenCalledWith(
      42,
      'session-user-1',
      'auth-code',
      'req-abc',
    );
  });

  it('returns 200 with syncedAt = null when the service reports no prior sync', async () => {
    completeGoogleCalendarConnectMock.mockResolvedValueOnce({
      provider: 'google',
      userId: 'session-user-1',
      syncedAt: null,
    });

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { syncedAt: string | null };
    };
    expect(json.data.syncedAt).toBeNull();
  });

  it('returns 401 when the user is not authenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(401);
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the code query parameter is missing', async () => {
    const res = await GET(callbackReq('?communityId=42&state=valid-state'));

    expect(res.status).toBe(400);
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the code query parameter is whitespace-only', async () => {
    const res = await GET(
      callbackReq('?communityId=42&code=%20%20&state=valid-state'),
    );

    expect(res.status).toBe(400);
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when OAuth state validation fails', async () => {
    validateOAuthStateMock.mockImplementationOnce(() => {
      throw new BadRequestError('Invalid OAuth state parameter');
    });

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=bad-state'),
    );

    expect(res.status).toBe(400);
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(403);
    expect(requireCalendarSyncEnabledForMembershipMock).not.toHaveBeenCalled();
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when calendar sync is disabled for the community type', async () => {
    requireCalendarSyncEnabledForMembershipMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Calendar sync is not enabled for this community type');
    });

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(403);
    expect(requireCalendarSyncWritePermissionMock).not.toHaveBeenCalled();
    expect(validateOAuthStateMock).not.toHaveBeenCalled();
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when calendar_sync.write permission is denied', async () => {
    requireCalendarSyncWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(403);
    expect(validateOAuthStateMock).not.toHaveBeenCalled();
    expect(completeGoogleCalendarConnectMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await GET(
      callbackReq('?communityId=42&code=auth-code&state=valid-state'),
    );

    expect(res.status).toBe(200);
    const call = completeGoogleCalendarConnectMock.mock.calls[0]!;
    expect(call[3]).toBeNull();
  });
});
