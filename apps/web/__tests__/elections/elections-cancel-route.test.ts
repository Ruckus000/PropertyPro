/**
 * Route unit tests — `POST /api/v1/elections/[id]/cancel`.
 *
 * Added alongside Plan A1 drain #45 (sibling precedent: drain #42
 * `POST /api/v1/elections/[id]/open`, PR #446). Covers the contracted
 * runRoute envelope: happy path, x-request-id null forwarding, 401 unauth,
 * 400 invalid params.id / zero-params.id / missing-communityId /
 * invalid-communityId (negative) / missing-canceledReason /
 * empty-canceledReason / too-long-canceledReason, 403 demo-grace, 403
 * non-member, 403 elections-disabled, 403 permission, 403 admin-role.
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
  cancelElectionForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requireElectionsAdminRoleMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  cancelElectionForCommunityMock: vi.fn(),
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

vi.mock('@/lib/services/elections-service', () => ({
  cancelElectionForCommunity: cancelElectionForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/cancel/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const CANCELED = {
  id: 7,
  status: 'canceled',
  canceledAt: new Date('2026-01-01T00:00:00Z'),
  canceledReason: 'Quorum not reached',
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/cancel`,
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

describe('POST /api/v1/elections/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireElectionsAdminRoleMock.mockReturnValue(undefined);
    cancelElectionForCommunityMock.mockResolvedValue(CANCELED);
  });

  it('cancels the election and returns wrapped service result (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, canceledReason: 'Quorum not reached' },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { id: number; status: string; canceledReason: string };
    };
    expect(json.data.id).toBe(7);
    expect(json.data.status).toBe('canceled');
    expect(json.data.canceledReason).toBe('Quorum not reached');
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
    expect(cancelElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      { canceledReason: 'Quorum not reached' },
      'req-abc',
    );
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(cancelElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      { canceledReason: 'Reason X' },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(
      jsonPost(7, { canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body communityId is negative', async () => {
    const res = await POST(
      jsonPost(15, { communityId: -1, canceledReason: 'Reason X' }),
      routeCtx('15'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing canceledReason', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when canceledReason is an empty string', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: '   ' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when canceledReason exceeds 500 chars', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'x'.repeat(501) }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireElectionsAdminRoleMock).not.toHaveBeenCalled();
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks the elections admin role', async () => {
    requireElectionsAdminRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Admin role required');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, canceledReason: 'Reason X' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });
});
