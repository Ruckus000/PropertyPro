/**
 * Route unit tests — `/api/v1/reserve-assets` (Wave 1 reserve transparency).
 *
 * The behaviour that matters most is the PERMISSION ASYMMETRY: `reserve_assets:read`
 * is open to every community member (owners AND tenants see the transparent
 * register) while `reserve_assets:write` is admin-tier. The feature is also
 * condo/HOA-only (hasReserveTransparency) and returns FACTUAL data only.
 *
 * `requireReserveTransparencyCommunity` uses the REAL `getFeaturesForCommunity`
 * from `@propertypro/shared` (condo_718/hoa_720 → true; apartment → false), so
 * the membership `communityType` drives the gate rather than a mock.
 *
 * `vi.hoisted` DATABASE_URL guard: the route imports `@propertypro/db`, whose
 * module load asserts a DB URL is present. We mock the module entirely, but the
 * guard keeps the import side-effect-free in case of eager evaluation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
});

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  createScopedClientMock,
  logAuditEventMock,
  paginateReserveAssetsForCommunityMock,
  getReserveAssetByIdMock,
  createReserveAssetForCommunityMock,
  updateReserveAssetByIdMock,
  softDeleteReserveAssetByIdMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  paginateReserveAssetsForCommunityMock: vi.fn(),
  getReserveAssetByIdMock: vi.fn(),
  createReserveAssetForCommunityMock: vi.fn(),
  updateReserveAssetByIdMock: vi.fn(),
  softDeleteReserveAssetByIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/services/reserve-asset-service', () => ({
  paginateReserveAssetsForCommunity: paginateReserveAssetsForCommunityMock,
  getReserveAssetById: getReserveAssetByIdMock,
  createReserveAssetForCommunity: createReserveAssetForCommunityMock,
  updateReserveAssetById: updateReserveAssetByIdMock,
  softDeleteReserveAssetById: softDeleteReserveAssetByIdMock,
}));

import { GET, POST, PATCH, DELETE } from '../../src/app/api/v1/reserve-assets/route';

const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  communityName: 'Sunset Condos',
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
};

const SCOPED = { __scoped: true };

const EXISTING_ASSET = {
  id: 7,
  communityId: 42,
  name: 'Main roof',
  category: 'roof',
  yearInstalled: 2015,
  usefulLifeYears: 25,
  replacementCostCents: 25_000_000,
  currentReserveCents: 9_000_000,
  notes: null,
};

const VALID_CREATE_BODY = {
  communityId: 42,
  name: 'Main roof',
  category: 'roof',
  yearInstalled: 2015,
  usefulLifeYears: 25,
};

const EMPTY_PAGE = {
  data: [] as Record<string, unknown>[],
  pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
};

function getReq(communityId?: string): NextRequest {
  const url =
    communityId === undefined
      ? 'http://localhost:3000/api/v1/reserve-assets'
      : `http://localhost:3000/api/v1/reserve-assets?communityId=${communityId}`;
  return new NextRequest(url);
}

function jsonReq(method: 'POST' | 'PATCH', payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/reserve-assets', {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteReq(id: number, communityId = 42): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/reserve-assets?id=${id}&communityId=${communityId}`,
    { method: 'DELETE' },
  );
}

describe('reserve-assets route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    paginateReserveAssetsForCommunityMock.mockResolvedValue(EMPTY_PAGE);
    getReserveAssetByIdMock.mockResolvedValue(EXISTING_ASSET);
    createReserveAssetForCommunityMock.mockResolvedValue({ ...EXISTING_ASSET, id: 1 });
    updateReserveAssetByIdMock.mockResolvedValue(EXISTING_ASSET);
    softDeleteReserveAssetByIdMock.mockResolvedValue(EXISTING_ASSET);
  });

  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('returns a paginated list with a computed RUL band', async () => {
      paginateReserveAssetsForCommunityMock.mockResolvedValue({
        ...EMPTY_PAGE,
        data: [{ ...EXISTING_ASSET, yearInstalled: 2015, usefulLifeYears: 25 }],
      });

      const res = await GET(getReq('42'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.data).toHaveLength(1);
      expect(json.data.data[0].endOfLifeYear).toBe(2040);
      expect(json.data.data[0]).toHaveProperty('rulBand');
      expect(json.data.data[0]).toHaveProperty('yearsRemaining');
      expect(json.data.pagination).toEqual(EMPTY_PAGE.pagination);
    });

    // The feature only works if every member can read. Guard against a
    // regression that adds an admin gate to the read path.
    it('lets a non-admin resident owner read the register', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);

      const res = await GET(getReq('42'));

      expect(res.status).toBe(200);
      expect(requirePermissionMock).toHaveBeenCalledWith(OWNER_MEMBERSHIP, 'reserve_assets', 'read');
    });

    it('uses the resolved communityId for the scoped client', async () => {
      await GET(getReq('42'));
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });

    it('401s when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError('Unauthorized'));
      const res = await GET(getReq('42'));
      expect(res.status).toBe(401);
    });

    it('400s without a communityId', async () => {
      const res = await GET(getReq());
      expect(res.status).toBe(400);
    });

    it('403s for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });

      const res = await GET(getReq('42'));

      expect(res.status).toBe(403);
      expect(paginateReserveAssetsForCommunityMock).not.toHaveBeenCalled();
    });

    it('403s when the read permission is denied', async () => {
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await GET(getReq('42'));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST
  // -------------------------------------------------------------------------

  describe('POST', () => {
    it('creates an asset and audit-logs it', async () => {
      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(200);
      expect(createReserveAssetForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          communityId: 42,
          name: 'Main roof',
          category: 'roof',
          yearInstalled: 2015,
          usefulLifeYears: 25,
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'reserve_asset',
          communityId: 42,
        }),
      );
    });

    it('coerces optional cost fields to null', async () => {
      await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(createReserveAssetForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          replacementCostCents: null,
          currentReserveCents: null,
          notes: null,
        }),
      );
    });

    it('400s on an unknown category', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, category: 'spaceship' }));
      expect(res.status).toBe(400);
      expect(createReserveAssetForCommunityMock).not.toHaveBeenCalled();
    });

    it('400s on a far-future install year', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, yearInstalled: 2199 }));
      expect(res.status).toBe(400);
      expect(createReserveAssetForCommunityMock).not.toHaveBeenCalled();
    });

    it('400s on a non-positive useful life', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, usefulLifeYears: 0 }));
      expect(res.status).toBe(400);
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });

      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(403);
      expect(createReserveAssetForCommunityMock).not.toHaveBeenCalled();
    });

    it('403s in demo grace before touching membership', async () => {
      assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo expired'));

      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(403);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('403s for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });
      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('updates an asset and audit-logs old/new values', async () => {
      const res = await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, notes: 'Replaced 2024' }));

      expect(res.status).toBe(200);
      expect(updateReserveAssetByIdMock).toHaveBeenCalledWith(
        SCOPED,
        7,
        expect.objectContaining({ notes: 'Replaced 2024' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'reserve_asset',
          oldValues: EXISTING_ASSET,
        }),
      );
    });

    it('404s when the asset does not exist', async () => {
      getReserveAssetByIdMock.mockResolvedValue(null);
      const res = await PATCH(jsonReq('PATCH', { id: 999, communityId: 42, notes: 'x' }));
      expect(res.status).toBe(404);
    });

    it('400s without an id', async () => {
      const res = await PATCH(jsonReq('PATCH', { communityId: 42, notes: 'x' }));
      expect(res.status).toBe(400);
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, notes: 'x' }));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------

  describe('DELETE', () => {
    it('soft-deletes an asset and audit-logs it', async () => {
      const res = await DELETE(deleteReq(7));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toEqual({ deleted: true, id: 7 });
      expect(softDeleteReserveAssetByIdMock).toHaveBeenCalledWith(SCOPED, 7);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'reserve_asset',
          oldValues: EXISTING_ASSET,
        }),
      );
    });

    it('404s when the asset does not exist', async () => {
      getReserveAssetByIdMock.mockResolvedValue(null);
      const res = await DELETE(deleteReq(999));
      expect(res.status).toBe(404);
      expect(softDeleteReserveAssetByIdMock).not.toHaveBeenCalled();
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await DELETE(deleteReq(7));
      expect(res.status).toBe(403);
    });
  });
});
