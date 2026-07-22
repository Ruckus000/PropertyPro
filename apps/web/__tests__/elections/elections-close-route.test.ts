/**
 * Route unit tests — POST /api/v1/elections/[id]/close.
 *
 * Added alongside Plan A1 drain #43. Pre-existing coverage in
 * `elections/routes.test.ts` only asserts the happy path; this file adds the
 * full auth-chain + validation matrix the migration to `runRoute()` unlocks
 * (canonical `VALIDATION_ERROR` envelope for invalid params/body,
 * demo-grace short-circuit, 401/403 ordering, missing communityId).
 *
 * Mechanically identical to drain #42 (elections/[id]/open) — same auth
 * chain, same body schema, different service (`closeElectionForCommunity`).
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
  closeElectionForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requireElectionsAdminRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  closeElectionForCommunityMock: vi.fn(),
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

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/elections-service', () => ({
  closeElectionForCommunity: closeElectionForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/close/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
  electionsAttorneyReviewed: true,
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/close`,
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

describe('POST /api/v1/elections/[id]/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireElectionsAdminRoleMock.mockReturnValue(undefined);
    closeElectionForCommunityMock.mockResolvedValue({
      id: 15,
      status: 'closed',
    });
  });

  it('closes the election and forwards x-request-id verbatim (happy path)', async () => {
    const res = await POST(
      jsonPost(15, { communityId: 42 }, { 'x-request-id': 'req-close-1' }),
      routeCtx('15'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data).toEqual({ id: 15, status: 'closed' });
    expect(closeElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-admin-1',
      'req-close-1',
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
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body omits communityId', async () => {
    const res = await POST(jsonPost(15, {}), routeCtx('15'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body communityId is zero (positive constraint)', async () => {
    const res = await POST(jsonPost(15, { communityId: 0 }), routeCtx('15'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are not enabled for this community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks elections.write permission', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(requireElectionsAdminRoleMock).not.toHaveBeenCalled();
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not an elections admin role', async () => {
    requireElectionsAdminRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Not an elections admin');
    });

    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(403);
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(jsonPost(15, { communityId: 42 }), routeCtx('15'));

    expect(res.status).toBe(200);
    expect(closeElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-admin-1',
      null,
    );
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(closeElectionForCommunityMock).not.toHaveBeenCalled();
  });
});
