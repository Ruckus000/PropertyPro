/**
 * Route unit tests — `POST /api/v1/arc/[id]/withdraw`.
 *
 * Added alongside Plan A1 drain #61. Covers the contracted runRoute envelope:
 * happy path (with the in-handler `createScopedClient` + `getActorUnitIds`
 * step), 401 unauth, 400 invalid params.id / zero / missing-communityId,
 * 403 demo-grace, 403 non-member, 403 arc-disabled, 403 permission, 403
 * arc-submitter-role denied, and x-request-id null forwarding.
 *
 * Note: this is the RESIDENT-submitter ARC withdraw endpoint and gates on
 * `requireArcSubmitterRole` rather than an ARC-admin role.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const SCOPED_SENTINEL = { __scoped: 'sentinel' };

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireArcEnabledMock,
  requireArcSubmitterRoleMock,
  getActorUnitIdsMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  withdrawArcSubmissionForCommunityMock,
  createScopedClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireArcEnabledMock: vi.fn(),
  requireArcSubmitterRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  withdrawArcSubmissionForCommunityMock: vi.fn(),
  createScopedClientMock: vi.fn(),
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

vi.mock('@/lib/violations/common', () => ({
  requireViolationFinesEnabled: vi.fn(),
  requireNoticePdfEnabled: vi.fn(),
  requireArcEnabled: requireArcEnabledMock,
  requireArcSubmitterRole: requireArcSubmitterRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  withdrawArcSubmissionForCommunity: withdrawArcSubmissionForCommunityMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

import { POST } from '../../src/app/api/v1/arc/[id]/withdraw/route';

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident-1',
  communityId: 42,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const WITHDRAW_RESULT = {
  id: 99,
  arcSubmissionId: 7,
  withdrawnAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/arc/${id}/withdraw`,
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

describe('POST /api/v1/arc/[id]/withdraw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    requireArcEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireArcSubmitterRoleMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED_SENTINEL);
    getActorUnitIdsMock.mockResolvedValue([101, 102]);
    withdrawArcSubmissionForCommunityMock.mockResolvedValue(WITHDRAW_RESULT);
  });

  it('withdraws an ARC submission (happy path) and threads scoped client + unitIds through to the service', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42 },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number } };
    expect(json.data.id).toBe(99);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-resident-1');
    expect(requireArcEnabledMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      RESIDENT_MEMBERSHIP,
      'arc_submissions',
      'write',
    );
    expect(requireArcSubmitterRoleMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(getActorUnitIdsMock).toHaveBeenCalledWith(SCOPED_SENTINEL, 'user-resident-1');
    expect(withdrawArcSubmissionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      [101, 102],
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireArcEnabledMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when ARC is disabled for the community', async () => {
    requireArcEnabledMock.mockRejectedValueOnce(new ForbiddenError('ARC not enabled'));

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when arc_submissions.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireArcSubmitterRoleMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not an ARC submitter', async () => {
    requireArcSubmitterRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Not an ARC submitter');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(createScopedClientMock).not.toHaveBeenCalled();
    expect(getActorUnitIdsMock).not.toHaveBeenCalled();
    expect(withdrawArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = withdrawArcSubmissionForCommunityMock.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});
