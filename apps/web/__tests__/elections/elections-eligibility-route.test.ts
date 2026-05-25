/**
 * Route unit tests — POST /api/v1/elections/[id]/eligibility.
 *
 * Added alongside Plan A1 drain #44. Pre-existing coverage in
 * `elections/routes.test.ts` only asserts the happy path; this file adds
 * the full auth-chain + validation matrix the migration to `runRoute()`
 * unlocks (canonical `VALIDATION_ERROR` envelope for invalid params/body,
 * demo-grace short-circuit, 401/403 ordering across all 7 gates).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  requireElectionsEnabledMock,
  requireElectionsAdminRoleMock,
  assertNotDemoGraceMock,
  snapshotElectionEligibilityForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requireElectionsAdminRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  snapshotElectionEligibilityForCommunityMock: vi.fn(),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
  requireElectionsAdminRole: requireElectionsAdminRoleMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  snapshotElectionEligibilityForCommunity: snapshotElectionEligibilityForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/eligibility/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
  electionsAttorneyReviewed: true,
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/eligibility`,
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

describe('POST /api/v1/elections/[id]/eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireElectionsAdminRoleMock.mockReturnValue(undefined);
    snapshotElectionEligibilityForCommunityMock.mockResolvedValue({
      electionId: 15,
      eligibleUnitCount: 18,
      insertedCount: 18,
      snapshotTakenAt: '2026-03-27T14:00:00.000Z',
    });
  });

  it('snapshots eligibility and returns the result (happy path)', async () => {
    const res = await POST(
      jsonPost(15, { communityId: 42 }, { 'x-request-id': 'req-6' }),
      routeCtx('15'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        electionId: number;
        eligibleUnitCount: number;
        insertedCount: number;
        snapshotTakenAt: string;
      };
    };
    expect(json.data).toEqual({
      electionId: 15,
      eligibleUnitCount: 18,
      insertedCount: 18,
      snapshotTakenAt: '2026-03-27T14:00:00.000Z',
    });
    expect(snapshotElectionEligibilityForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-admin-1',
      'req-6',
    );
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'elections',
      'write',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42 }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body omits communityId', async () => {
    const res = await POST(jsonPost(15, {}), routeCtx('15'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body communityId is zero (positive constraint)', async () => {
    const res = await POST(jsonPost(15, { communityId: 0 }), routeCtx('15'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are not enabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(requireElectionsAdminRoleMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks elections.write permission', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireElectionsAdminRoleMock).not.toHaveBeenCalled();
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not an elections admin', async () => {
    requireElectionsAdminRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Not an elections admin');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(snapshotElectionEligibilityForCommunityMock).not.toHaveBeenCalled();
  });
});
