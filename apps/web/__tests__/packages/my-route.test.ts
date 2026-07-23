/**
 * Route unit test — `GET /api/v1/packages/my`.
 *
 * Plan A1 drain #10. Mirrors drain #2 (`users/names`) precedent:
 *   - Query-only input; `resolveEffectiveCommunityId` reconciles header/query.
 *   - 400 cases asserted on status only (runner emits VALIDATION_ERROR body).
 *   - Header/query mismatch returns 404 (regression from pre-migration 400 /
 *     silent-pass; tracked as an intentional behavior change in the route
 *     docblock).
 *   - Multi-gate auth chain — each gate has its own 403 case.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePackageLoggingEnabledMock,
  requirePackagesReadPermissionMock,
  isResidentRoleMock,
  requireActorUnitIdsMock,
  listMyPackagesForCommunityMock,
  createScopedClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePackageLoggingEnabledMock: vi.fn(),
  requirePackagesReadPermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  requireActorUnitIdsMock: vi.fn(),
  listMyPackagesForCommunityMock: vi.fn(),
  createScopedClientMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/logistics/common', () => ({
  isResidentRole: isResidentRoleMock,
  requireActorUnitIds: requireActorUnitIdsMock,
  requirePackageLoggingEnabled: requirePackageLoggingEnabledMock,
  requirePackagesReadPermission: requirePackagesReadPermissionMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  listMyPackagesForCommunity: listMyPackagesForCommunityMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

import { GET } from '../../src/app/api/v1/packages/my/route';

const COMMUNITY_ID = 42;
const ACTOR_USER_ID = 'user-resident-1';
const SCOPED_CLIENT = { __scoped: true };

const RESIDENT_MEMBERSHIP = {
  userId: ACTOR_USER_ID,
  communityId: COMMUNITY_ID,
  communityName: 'Sunset Condos',
  role: 'resident',
  communityType: 'condo_718',
  subscriptionPlan: null,
  subscriptionStatus: null,
  freeAccessExpiresAt: null,
  timezone: 'America/New_York',
  isUnitOwner: true,
  isAdmin: false,
  displayTitle: 'Unit Owner',
  city: 'Miami',
  state: 'FL',
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
  electionsAttorneyReviewed: false,
};

describe('GET /api/v1/packages/my', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR_USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    requirePackageLoggingEnabledMock.mockResolvedValue(undefined);
    requirePackagesReadPermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(true);
    createScopedClientMock.mockReturnValue(SCOPED_CLIENT);
    requireActorUnitIdsMock.mockResolvedValue([101, 102]);
    listMyPackagesForCommunityMock.mockResolvedValue([
      { id: 1, status: 'received', unitId: 101 },
      { id: 2, status: 'received', unitId: 102 },
    ]);
  });

  it('returns the resident-scoped packages list (happy path)', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      ACTOR_USER_ID,
    );
    expect(requirePackageLoggingEnabledMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(requirePackagesReadPermissionMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(isResidentRoleMock).toHaveBeenCalledWith('resident');
    expect(createScopedClientMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireActorUnitIdsMock).toHaveBeenCalledWith(SCOPED_CLIENT, ACTOR_USER_ID);
    expect(listMyPackagesForCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, [101, 102]);
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: 1, status: 'received', unitId: 101 },
        { id: 2, status: 'received', unitId: 102 },
      ],
    });
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(requirePackageLoggingEnabledMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when package logging is disabled for the community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePackageLoggingEnabledMock.mockRejectedValue(
      new ForbiddenError('Package logging is disabled for this community'),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(requirePackagesReadPermissionMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the read permission gate denies', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePackagesReadPermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Permission denied');
    });

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(isResidentRoleMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 with literal message when the actor is not a resident', async () => {
    isResidentRoleMock.mockReturnValue(false);
    requireCommunityMembershipMock.mockResolvedValue({
      ...RESIDENT_MEMBERSHIP,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Only residents can use the my-packages view',
      },
    });
  });

  it('returns 400 when communityId is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/packages/my');
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is not a positive integer', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/packages/my?communityId=0',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the x-community-id header disagrees with the query (preserves pre-migration behavior — parseCommunityIdFromQuery already delegated to resolveEffectiveCommunityId)', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
      { headers: { 'x-community-id': '99' } },
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the resident has no unit associations (requireActorUnitIds gate)', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireActorUnitIdsMock.mockRejectedValueOnce(
      new ForbiddenError(
        'No unit association found for this user in the selected community',
      ),
    );

    const req = new NextRequest(
      `http://localhost:3000/api/v1/packages/my?communityId=${COMMUNITY_ID}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    // The route must NOT call the package list when the unit-association
    // gate trips — without this guard, listPackagesForCommunity would skip
    // the `inArray(unitId, allowedUnitIds)` filter on empty arrays and
    // return ALL packages for the community (data-exposure regression).
    expect(listMyPackagesForCommunityMock).not.toHaveBeenCalled();
  });
});
