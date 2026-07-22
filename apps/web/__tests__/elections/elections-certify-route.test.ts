/**
 * Route unit tests — `POST /api/v1/elections/[id]/certify`.
 *
 * Added alongside Plan A1 drain #46. Covers the contracted runRoute envelope:
 * happy path with explicit resultsDocumentId, explicit-null, omitted (?? null
 * coercion), 401 unauth, 400 invalid params.id / missing-communityId /
 * invalid-communityId / invalid-resultsDocumentId, 403 demo-grace,
 * 403 non-member, 403 elections-disabled, 403 permission, 403 admin-role,
 * and x-request-id null forwarding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireElectionsEnabledMock,
  requireElectionsAdminRoleMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  certifyElectionForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requireElectionsAdminRoleMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  certifyElectionForCommunityMock: vi.fn(),
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

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
  requireElectionsAdminRole: requireElectionsAdminRoleMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/elections-service', () => ({
  certifyElectionForCommunity: certifyElectionForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/certify/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const CERTIFIED = {
  id: 7,
  status: 'certified',
  certifiedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/certify`,
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

describe('POST /api/v1/elections/[id]/certify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireElectionsAdminRoleMock.mockReturnValue(undefined);
    certifyElectionForCommunityMock.mockResolvedValue(CERTIFIED);
  });

  it('certifies the election with explicit resultsDocumentId (happy path)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, resultsDocumentId: 42 }, { 'x-request-id': 'req-abc' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(7);
    expect(json.data.status).toBe('certified');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireElectionsEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'elections',
      'write',
    );
    expect(requireElectionsAdminRoleMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(certifyElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      { resultsDocumentId: 42 },
      'req-abc',
    );
  });

  it('certifies with explicit null resultsDocumentId', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, resultsDocumentId: null }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(certifyElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      { resultsDocumentId: null },
      null,
    );
  });

  it('coerces omitted resultsDocumentId to null via ?? null', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(certifyElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      { resultsDocumentId: null },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body communityId is negative', async () => {
    const res = await POST(jsonPost(7, { communityId: -1 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when resultsDocumentId is zero (fails positive)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, resultsDocumentId: 0 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireElectionsAdminRoleMock).not.toHaveBeenCalled();
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks the elections admin role', async () => {
    requireElectionsAdminRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Admin role required');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(certifyElectionForCommunityMock).not.toHaveBeenCalled();
  });
});
