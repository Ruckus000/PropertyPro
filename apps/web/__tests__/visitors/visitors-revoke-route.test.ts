/**
 * Route unit tests — `POST /api/v1/visitors/[id]/revoke`.
 *
 * Added alongside Plan A1 drain #93. Covers the contracted runRoute envelope:
 *
 *   - happy path admin with reason (service called with (42, 7, actorId, reason, requestId))
 *   - happy path resident with reason
 *   - happy path resident with no reason (?? null coercion to 5th arg)
 *   - 400 admin without reason — ValidationError('Reason is required for staff
 *     revocations'); service NOT called
 *   - 401 unauth
 *   - 400 params.id non-numeric / zero
 *   - 400 missing communityId
 *   - 403 demo-grace (requireCommunityMembership NOT called)
 *   - 403 non-member
 *   - 403 visitor-logging disabled (ASYNC throw; requireVisitorsWritePermission
 *     NOT called)
 *   - 403 visitors.write permission denied
 *   - 403 resident-revoke feature disabled (getVisitorHostUserId NOT called)
 *   - 403 resident not host (different userId) — 'You can only revoke passes
 *     you registered'
 *   - 403 resident not host (null host) — same error message
 *   - 403 "other" role (not admin, not resident — synthetic pathological case)
 *   - null x-request-id forwarded when header absent
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermissionMock,
  isResidentRoleMock,
  assertNotDemoGraceMock,
  isResidentVisitorRevokeEnabledMock,
  getVisitorHostUserIdMock,
  revokeVisitorForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsWritePermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  isResidentVisitorRevokeEnabledMock: vi.fn(),
  getVisitorHostUserIdMock: vi.fn(),
  revokeVisitorForCommunityMock: vi.fn(),
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

vi.mock('@/lib/logistics/common', () => ({
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermission: requireVisitorsWritePermissionMock,
  isResidentRole: isResidentRoleMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  isResidentVisitorRevokeEnabled: isResidentVisitorRevokeEnabledMock,
  getVisitorHostUserId: getVisitorHostUserIdMock,
  revokeVisitorForCommunity: revokeVisitorForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/visitors/[id]/revoke/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Manager',
  communityType: 'condo_718' as const,
};

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

// "Other" role: synthetic / pathological — not admin AND not resident.
// Real `NEW_COMMUNITY_ROLES` is ['resident', 'manager', 'pm_admin'] so this
// state can only arise from a misconfigured membership (e.g. pm_admin with
// isAdmin=false). The handler's else branch must still throw.
const OTHER_MEMBERSHIP = {
  userId: 'user-other',
  communityId: 42,
  role: 'pm_admin' as const,
  isAdmin: false,
  isUnitOwner: false,
  displayTitle: 'PM Admin',
  communityType: 'apartment' as const,
};

const REVOKE_RESULT = {
  id: 7,
  communityId: 42,
  hostUserId: 'user-resident',
  revokedAt: new Date('2026-01-01T00:00:00Z'),
  revokedByUserId: 'user-admin',
  expectedArrival: new Date('2026-01-01T12:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/visitors/${id}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/visitors/[id]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsWritePermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockImplementation((role: string) => role === 'resident');
    isResidentVisitorRevokeEnabledMock.mockResolvedValue(true);
    getVisitorHostUserIdMock.mockResolvedValue('user-resident');
    revokeVisitorForCommunityMock.mockResolvedValue(REVOKE_RESULT);
  });

  it('revokes successfully on the admin path with reason (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, reason: 'Pass expired' },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; communityId: number } };
    expect(json.data.id).toBe(7);
    expect(json.data.communityId).toBe(42);

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin');
    expect(requireVisitorLoggingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireVisitorsWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    // Admin short-circuits before the resident-only branches run.
    expect(isResidentVisitorRevokeEnabledMock).not.toHaveBeenCalled();
    expect(getVisitorHostUserIdMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      'Pass expired',
      'req-abc',
    );
  });

  it('revokes successfully on the resident path with no reason (?? null coercion)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

    const res = await POST(
      jsonPost(7, { communityId: 42 }, { 'x-request-id': 'req-r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(isResidentVisitorRevokeEnabledMock).toHaveBeenCalledWith(42);
    expect(getVisitorHostUserIdMock).toHaveBeenCalledWith(42, 7);
    expect(revokeVisitorForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident',
      null, // body.reason ?? null
      'req-r',
    );
  });

  it('revokes successfully on the resident path with a reason', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'Their pass' }, { 'x-request-id': 'req-r2' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(revokeVisitorForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident',
      'Their pass',
      'req-r2',
    );
  });

  it('returns 400 when the admin caller omits the reason', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.message).toBe('Reason is required for staff revocations');
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, reason: 'r' }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, reason: 'r' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, { reason: 'r' }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership check)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled (ASYNC requireVisitorLoggingEnabled throws)', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireVisitorsWritePermissionMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitors.write permission is denied', async () => {
    requireVisitorsWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the resident-revoke feature is disabled for the community', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    isResidentVisitorRevokeEnabledMock.mockResolvedValueOnce(false);

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe(
      'Resident visitor pass revocation is not enabled for this community',
    );
    expect(getVisitorHostUserIdMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the resident is not the host (different userId)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    getVisitorHostUserIdMock.mockResolvedValueOnce('someone-else');

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('You can only revoke passes you registered');
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the visitor host lookup returns null (pass not found / soft-deleted)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    getVisitorHostUserIdMock.mockResolvedValueOnce(null);

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('You can only revoke passes you registered');
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is neither admin nor a resident ("other" branch)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-other');
    requireCommunityMembershipMock.mockResolvedValue(OTHER_MEMBERSHIP);

    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe(
      'Only staff or the registering resident can revoke a pass',
    );
    expect(isResidentVisitorRevokeEnabledMock).not.toHaveBeenCalled();
    expect(getVisitorHostUserIdMock).not.toHaveBeenCalled();
    expect(revokeVisitorForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, reason: 'r' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = revokeVisitorForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});
