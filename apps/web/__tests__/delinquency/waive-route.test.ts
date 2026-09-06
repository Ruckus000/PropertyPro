/**
 * Route unit tests — `POST /api/v1/delinquency/[unitId]/waive`.
 *
 * Added alongside Plan A1 drain #80. Covers the contracted runRoute envelope:
 * happy path, 401 unauth, 400 invalid params.unitId (non-numeric / zero),
 * 400 missing body communityId, 403 for demo-grace / non-member /
 * finance-disabled / finance-write / finance-admin-write / inactive
 * subscription, plus x-request-id null forwarding.
 *
 * Mirrors drain #67 (assessments/[id]/generate). Key differences:
 *   - Path param is `unitId` (NOT `id`).
 *   - Body has no `dueDate`.
 *   - Service `waiveLateFeesForUnit(communityId, unitId, actorUserId, requestId)`
 *     takes 4 args; x-request-id is index [3] (NOT [4]).
 *
 * NOTE: `requireActiveSubscriptionForMutation` runs LAST in the auth chain
 * (after finance-admin-write), per the pre-migration source.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireFinanceEnabledMock,
  requireFinanceWritePermissionMock,
  requireFinanceAdminWriteMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  waiveLateFeesForUnitMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceWritePermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  waiveLateFeesForUnitMock: vi.fn(),
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

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceWritePermission: requireFinanceWritePermissionMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  waiveLateFeesForUnit: waiveLateFeesForUnitMock,
}));

import { POST } from '../../src/app/api/v1/delinquency/[unitId]/waive/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const WAIVE_RESULT = {
  waivedCount: 3,
  waivedAmountCents: 7500,
};

function jsonPost(
  unitId: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/delinquency/${unitId}/waive`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(unitId: string) {
  return { params: Promise.resolve({ unitId }) };
}

describe('POST /api/v1/delinquency/[unitId]/waive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceWritePermissionMock.mockReturnValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    waiveLateFeesForUnitMock.mockResolvedValue(WAIVE_RESULT);
  });

  it('waives late fees for the unit (happy path)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42 }, { 'x-request-id': 'req-abc' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { waivedCount: number; waivedAmountCents: number } };
    expect(json.data.waivedCount).toBe(3);
    expect(json.data.waivedAmountCents).toBe(7500);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireFinanceEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(waiveLateFeesForUnitMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.unitId is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42 }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.unitId is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/finance checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(requireFinanceWritePermissionMock).not.toHaveBeenCalled();
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance is disabled for the community', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance not enabled'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceWritePermissionMock).not.toHaveBeenCalled();
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance.write permission is denied', async () => {
    requireFinanceWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller fails the finance-admin-write gate', async () => {
    requireFinanceAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Finance admin required');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the community has no active subscription for mutations', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
      new ForbiddenError('Subscription required for mutations'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(waiveLateFeesForUnitMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(200);
    const call = waiveLateFeesForUnitMock.mock.calls[0]!;
    expect(call[3]).toBeNull();
  });
});
