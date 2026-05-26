/**
 * Route unit tests — `GET /api/v1/arc/[id]`.
 *
 * Added alongside Plan A1 drain #68. Covers the contracted runRoute
 * envelope: happy path as ADMIN (no resident-unit-filter) and as RESIDENT
 * (filter passed); 401 unauth; 400 invalid params.id (non-numeric / zero);
 * 404 x-community-id header mismatch; 403 non-member; 403 arc-disabled;
 * 403 permission denied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';

const SCOPED_SENTINEL = { __scoped: true } as const;

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireArcEnabledMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  requirePermissionMock,
  getArcSubmissionForCommunityMock,
  createScopedClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireArcEnabledMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getArcSubmissionForCommunityMock: vi.fn(),
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
  requireArcEnabled: requireArcEnabledMock,
  isResidentRole: isResidentRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  getArcSubmissionForCommunity: getArcSubmissionForCommunityMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

import { GET } from '../../src/app/api/v1/arc/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const SUBMISSION_RESULT = {
  id: 7,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonGet(
  id: string | number,
  communityId: string | number | null = 42,
  headers?: Record<string, string>,
): NextRequest {
  const url =
    communityId === null
      ? `http://localhost:3000/api/v1/arc/${id}`
      : `http://localhost:3000/api/v1/arc/${id}?communityId=${communityId}`;
  return new NextRequest(url, {
    method: 'GET',
    headers: { ...(headers ?? {}) },
  });
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/arc/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireArcEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    getActorUnitIdsMock.mockResolvedValue([101, 102]);
    createScopedClientMock.mockReturnValue(SCOPED_SENTINEL);
    getArcSubmissionForCommunityMock.mockResolvedValue(SUBMISSION_RESULT);
  });

  it('returns the submission for an admin (no resident-unit-filter)', async () => {
    isResidentRoleMock.mockReturnValue(false);

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(7);
    expect(json.data.status).toBe('pending');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireArcEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'arc_submissions',
      'read',
    );
    expect(getActorUnitIdsMock).not.toHaveBeenCalled();
    expect(getArcSubmissionForCommunityMock).toHaveBeenCalledWith(42, 7, undefined);
  });

  it('returns the submission for a resident with their owned-unit-ids filter', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident-1');
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([101, 102]);

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(isResidentRoleMock).toHaveBeenCalledWith('resident');
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(getActorUnitIdsMock).toHaveBeenCalledWith(SCOPED_SENTINEL, 'user-resident-1');
    expect(getArcSubmissionForCommunityMock).toHaveBeenCalledWith(42, 7, [101, 102]);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await GET(jsonGet('abc', 42), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await GET(jsonGet('0', 42), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query communityId', async () => {
    resolveEffectiveCommunityIdMock.mockImplementationOnce(() => {
      throw new NotFoundError('Community not found');
    });

    const res = await GET(
      jsonGet(7, 42, { 'x-community-id': '99' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireArcEnabledMock).not.toHaveBeenCalled();
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when ARC is disabled for the community', async () => {
    requireArcEnabledMock.mockRejectedValueOnce(new ForbiddenError('ARC not enabled'));

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when arc_submissions.read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(jsonGet(7, 42), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(getArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });
});
