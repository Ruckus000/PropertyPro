/**
 * Route unit tests — `DELETE /api/v1/calendar/google/disconnect`.
 *
 * Added alongside Plan A1 drain #89. Covers the contracted runRoute
 * envelope for the body-only DELETE on the Google Calendar disconnect
 * endpoint. Mirrors the test surface from drain #84 (`accounting/disconnect`)
 * but with the calendar-sync gate pair (`requireCalendarSyncEnabledForMembership`
 * + `requireCalendarSyncWritePermission`) in place of the accounting one.
 *
 * Cases: happy path, 401 unauth, 400 missing communityId, 400 non-positive
 * communityId, 400 non-integer communityId, 400 invalid JSON body,
 * 403 demo-grace, 403 non-member, 403 calendar-sync disabled, 403
 * calendar-sync write permission denied, and x-request-id null forwarding
 * at the 3rd arg position.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermissionMock,
  assertNotDemoGraceMock,
  disconnectGoogleCalendarMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireCalendarSyncEnabledForMembershipMock: vi.fn(),
  requireCalendarSyncWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  disconnectGoogleCalendarMock: vi.fn(),
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

vi.mock('@/lib/calendar/common', () => ({
  requireCalendarSyncEnabledForMembership: requireCalendarSyncEnabledForMembershipMock,
  requireCalendarSyncWritePermission: requireCalendarSyncWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/calendar-sync-service', () => ({
  disconnectGoogleCalendar: disconnectGoogleCalendarMock,
}));

import { DELETE } from '../../src/app/api/v1/calendar/google/disconnect/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const DISCONNECT_RESULT = { disconnected: true };

function jsonDelete(
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/v1/calendar/google/disconnect',
    {
      method: 'DELETE',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

describe('DELETE /api/v1/calendar/google/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCalendarSyncEnabledForMembershipMock.mockReturnValue(undefined);
    requireCalendarSyncWritePermissionMock.mockReturnValue(undefined);
    disconnectGoogleCalendarMock.mockResolvedValue(DISCONNECT_RESULT);
  });

  it('disconnects Google Calendar (happy path)', async () => {
    const res = await DELETE(
      jsonDelete({ communityId: 42 }, { 'x-request-id': 'req-abc' }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { disconnected: boolean } };
    expect(json).toEqual({ data: { disconnected: true } });

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireCalendarSyncEnabledForMembershipMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
    );
    expect(requireCalendarSyncWritePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
    );
    expect(disconnectGoogleCalendarMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing communityId', async () => {
    const res = await DELETE(jsonDelete({}));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is not positive', async () => {
    const res = await DELETE(jsonDelete({ communityId: -1 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is not an integer', async () => {
    const res = await DELETE(jsonDelete({ communityId: 1.5 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/calendar/google/disconnect',
      {
        method: 'DELETE',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      },
    );

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo-grace (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new ForbiddenError('Demo grace period active'),
    );

    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(403);
    expect(requireCalendarSyncEnabledForMembershipMock).not.toHaveBeenCalled();
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 403 when calendar sync is disabled for the community', async () => {
    requireCalendarSyncEnabledForMembershipMock.mockImplementation(() => {
      throw new ForbiddenError('Calendar sync not enabled');
    });

    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(403);
    expect(requireCalendarSyncWritePermissionMock).not.toHaveBeenCalled();
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 403 when calendar_sync.write permission is denied', async () => {
    requireCalendarSyncWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing calendar_sync:write permission');
    });

    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(403);
    expect(disconnectGoogleCalendarMock).not.toHaveBeenCalled();
  });

  it('forwards null x-request-id verbatim when the header is absent', async () => {
    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(200);
    expect(disconnectGoogleCalendarMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      null,
    );
    // Belt-and-suspenders: assert exact index [2] position.
    const call = disconnectGoogleCalendarMock.mock.calls[0]!;
    expect(call[2]).toBeNull();
  });
});
