/**
 * Route unit tests — `POST /api/v1/elections/[id]/proxies/[proxyId]/revoke`.
 *
 * Added alongside Plan A1 drain #49. **Diverges from drains #47/#48** —
 * NO admin role gate (non-admins can revoke their own proxy), and the
 * service takes a 6th arg `actorIsAdmin: boolean` derived from
 * `membership.isAdmin`. Tests assert both admin=true and admin=false
 * propagation to the service.
 *
 * Coverage: happy (admin), happy (non-admin) propagating isAdmin=false,
 * 401, 400 params.id non-numeric, 400 params.id zero, 400 params.proxyId
 * non-numeric, 400 params.proxyId zero, 400 missing communityId, 400
 * invalid communityId, 403 demo-grace, 403 non-member, 403 elections-disabled,
 * 403 permission, x-request-id null forwarding.
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
  requirePermissionMock,
  assertNotDemoGraceMock,
  revokeElectionProxyForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  revokeElectionProxyForCommunityMock: vi.fn(),
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
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  revokeElectionProxyForCommunity: revokeElectionProxyForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/proxies/[proxyId]/revoke/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  userId: 'user-owner-1',
  communityId: 42,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const REVOKED = {
  id: 3,
  electionId: 7,
  status: 'revoked',
  revokedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  proxyId: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/proxies/${proxyId}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string, proxyId: string) {
  return { params: Promise.resolve({ id, proxyId }) };
}

describe('POST /api/v1/elections/[id]/proxies/[proxyId]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    revokeElectionProxyForCommunityMock.mockResolvedValue(REVOKED);
  });

  it('revokes the proxy and returns wrapped service result (happy path, admin)', async () => {
    const res = await POST(
      jsonPost(7, 3, { communityId: 42 }, { 'x-request-id': 'req-abc' }),
      routeCtx('7', '3'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { id: number; electionId: number; status: string };
    };
    expect(json.data.id).toBe(3);
    expect(json.data.electionId).toBe(7);
    expect(json.data.status).toBe('revoked');
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
    expect(revokeElectionProxyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      3,
      'user-admin-1',
      true,
      'req-abc',
    );
  });

  it('propagates isAdmin=false to the service when the caller is a non-admin owner', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-owner-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const res = await POST(
      jsonPost(7, 3, { communityId: 42 }, { 'x-request-id': 'req-owner' }),
      routeCtx('7', '3'),
    );

    expect(res.status).toBe(200);
    expect(revokeElectionProxyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      3,
      'user-owner-1',
      false,
      'req-owner',
    );
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(200);
    expect(revokeElectionProxyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      3,
      'user-admin-1',
      true,
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(401);
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', 3, { communityId: 42 }),
      routeCtx('abc', '3'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', 3, { communityId: 42 }),
      routeCtx('0', '3'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.proxyId is non-numeric', async () => {
    const res = await POST(
      jsonPost(7, 'xyz', { communityId: 42 }),
      routeCtx('7', 'xyz'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.proxyId is zero', async () => {
    const res = await POST(
      jsonPost(7, '0', { communityId: 42 }),
      routeCtx('7', '0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, 3, {}), routeCtx('7', '3'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body communityId is negative', async () => {
    const res = await POST(jsonPost(7, 3, { communityId: -1 }), routeCtx('7', '3'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, 3, { communityId: 42 }), routeCtx('7', '3'));

    expect(res.status).toBe(403);
    expect(revokeElectionProxyForCommunityMock).not.toHaveBeenCalled();
  });
});
