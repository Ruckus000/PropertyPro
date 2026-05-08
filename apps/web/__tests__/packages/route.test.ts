/**
 * Unit tests for `/api/v1/packages` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with correct table + scoped client
 * - Filter pushdown: status, unitId, resident allowedUnitIds → SQL `where`
 * - Resident requesting a unitId outside their allowed list → 403
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (regression: B3
 *   lesson #5, `||` not `??`)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  packageLogTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePackageLoggingEnabledMock,
  requirePackagesReadPermissionMock,
  isResidentRoleMock,
  requireActorUnitIdsMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  packageLogTable: {
    id: Symbol('package_log.id'),
    unitId: Symbol('package_log.unit_id'),
    status: Symbol('package_log.status'),
  },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePackageLoggingEnabledMock: vi.fn(),
  requirePackagesReadPermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  requireActorUnitIdsMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  packageLog: packageLogTable,
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
}));

// Identity-ish mocks so the route's `where` predicate can be inspected without
// coupling to drizzle SQL internals.
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: vi.fn(),
}));

vi.mock('@/lib/logistics/common', () => ({
  isResidentRole: isResidentRoleMock,
  requireActorUnitIds: requireActorUnitIdsMock,
  requirePackageLoggingEnabled: requirePackageLoggingEnabledMock,
  requirePackagesReadPermission: requirePackagesReadPermissionMock,
  requirePackagesWritePermission: vi.fn(),
  requireStaffOperator: vi.fn(),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: (s: string) => Number(s),
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  createPackageForCommunity: vi.fn(),
}));

vi.mock('@/lib/services/units-lookup', () => ({
  resolveUnitIdByLabel: vi.fn(),
}));

import { GET } from '../../src/app/api/v1/packages/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const staffMembership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

const residentMembership = {
  ...staffMembership,
  userId: 'user-tenant',
  role: 'tenant',
  isAdmin: false,
  isUnitOwner: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requirePackageLoggingEnabledMock.mockResolvedValue(undefined);
  requirePackagesReadPermissionMock.mockReturnValue(undefined);
  isResidentRoleMock.mockReturnValue(false);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/packages — paginate() integration', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1 }, { id: 2 }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(2);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(packageLogTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    // No filters → no where predicate.
    expect(options.where).toBeUndefined();
  });

  it('pushes status filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&status=received`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: packageLogTable.status, val: 'received' },
    });
  });

  it('pushes unitId filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&unitId=42`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: packageLogTable.unitId, val: 42 },
    });
  });

  it('combines multiple filters via and()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&status=notified&unitId=7`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: { __and: unknown[] } },
    ];
    expect(options.where).toEqual({
      __and: [
        { __eq: { col: packageLogTable.unitId, val: 7 } },
        { __eq: { col: packageLogTable.status, val: 'notified' } },
      ],
    });
  });

  it('confines residents to their allowed unit ids via inArray()', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    requireActorUnitIdsMock.mockResolvedValue([10, 11]);
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __inArray: { col: packageLogTable.unitId, vals: [10, 11] },
    });
  });

  it('throws ForbiddenError when a resident requests a unit outside their allowed set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    requireActorUnitIdsMock.mockResolvedValue([10, 11]);

    await expect(
      GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&unitId=42`)),
    ).rejects.toThrow('You can only view packages for your own unit');

    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.pagination).toEqual({
      nextCursor: 'next-opaque',
      hasMore: true,
      pageSize: 25,
    });

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: 'abc', pageSize: 25 });
  });

  it('treats empty-string ?cursor= and ?pageSize= as missing (B3 lesson #5)', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
  });

  it('rejects an invalid status filter with a ValidationError', async () => {
    await expect(
      GET(makeRequest(`/api/v1/packages?communityId=${COMMUNITY_ID}&status=garbage`)),
    ).rejects.toThrow('Invalid package status filter');

    expect(paginateMock).not.toHaveBeenCalled();
  });
});
