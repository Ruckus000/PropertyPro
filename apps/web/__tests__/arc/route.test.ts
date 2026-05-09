/**
 * Unit tests for `/api/v1/arc` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client
 * - Filter pushdown: status, unitId, resident allowedUnitIds → SQL `where`
 * - Resident requesting a unitId outside their allowed set → 403
 * - Resident with zero allowed units → empty paginated envelope (no paginate call)
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 * - `mapArcRow` normalization applied to returned rows
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  arcSubmissionsTable,
  mapArcRowMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireArcEnabledMock,
  requirePermissionMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  arcSubmissionsTable: {
    id: Symbol('arc_submissions.id'),
    unitId: Symbol('arc_submissions.unit_id'),
    status: Symbol('arc_submissions.status'),
  },
  mapArcRowMock: vi.fn((row: Record<string, unknown>) => ({ ...row, __mapped: true })),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireArcEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  arcSubmissions: arcSubmissionsTable,
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
}));

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

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: (s: string) => Number(s),
}));

vi.mock('@/lib/violations/common', () => ({
  isResidentRole: isResidentRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
  requireArcEnabled: requireArcEnabledMock,
  requireArcSubmitterRole: vi.fn(),
}));

vi.mock('@/lib/services/violations-service', () => ({
  createArcSubmissionForCommunity: vi.fn(),
  mapArcRow: mapArcRowMock,
  // After A3 drain #57, the route imports `paginateArcSubmissionsForCommunity`
  // from the service. Delegate to the underlying `paginateMock` with the
  // same where + short-circuit semantics so all 8 GET assertions stay valid.
  paginateArcSubmissionsForCommunity: async (params: {
    communityId: number;
    cursor?: string;
    pageSize?: number;
    status?: string;
    unitId?: number;
    allowedUnitIds?: number[];
  }) => {
    if (params.allowedUnitIds && params.allowedUnitIds.length === 0) {
      return {
        data: [],
        pagination: { nextCursor: null, hasMore: false, pageSize: params.pageSize ?? 50 },
      };
    }
    const { eq, and, inArray } = await import('@propertypro/db/filters');
    const clauses: unknown[] = [];
    if (params.status !== undefined) {
      clauses.push(eq(arcSubmissionsTable.status as never, params.status as never));
    }
    if (params.unitId !== undefined) {
      clauses.push(eq(arcSubmissionsTable.unitId as never, params.unitId as never));
    }
    if (params.allowedUnitIds && params.allowedUnitIds.length > 0) {
      clauses.push(inArray(arcSubmissionsTable.unitId as never, params.allowedUnitIds as never));
    }
    const where =
      clauses.length === 0
        ? undefined
        : clauses.length === 1
          ? clauses[0]
          : and(...(clauses as never[]));
    const result = await paginateMock(
      createScopedClientMock(params.communityId),
      arcSubmissionsTable,
      { cursor: params.cursor, pageSize: params.pageSize },
      { where },
    );
    return {
      data: (result.data as Record<string, unknown>[]).map((r) => mapArcRowMock(r)),
      pagination: result.pagination,
    };
  },
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
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

import { GET } from '../../src/app/api/v1/arc/route';

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
};

beforeEach(() => {
  vi.clearAllMocks();
  mapArcRowMock.mockImplementation((row: Record<string, unknown>) => ({ ...row, __mapped: true }));
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireArcEnabledMock.mockResolvedValue(undefined);
  requirePermissionMock.mockReturnValue(undefined);
  isResidentRoleMock.mockReturnValue(false);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/arc — paginate() integration', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, status: 'submitted', attachmentDocumentIds: [10] }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0].__mapped).toBe(true);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(arcSubmissionsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    expect(options.where).toBeUndefined();
  });

  it('pushes status filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&status=approved`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: arcSubmissionsTable.status, val: 'approved' },
    });
  });

  it('pushes unitId filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&unitId=42`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: arcSubmissionsTable.unitId, val: 42 },
    });
  });

  it('combines status + unitId via and()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&status=under_review&unitId=7`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: { __and: unknown[] } },
    ];
    expect(options.where).toEqual({
      __and: [
        { __eq: { col: arcSubmissionsTable.status, val: 'under_review' } },
        { __eq: { col: arcSubmissionsTable.unitId, val: 7 } },
      ],
    });
  });

  it('confines residents to their allowed unit ids via inArray()', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __inArray: { col: arcSubmissionsTable.unitId, vals: [10, 11] },
    });
  });

  it('returns an empty paginated envelope for a resident with zero allowed units (no paginate call)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([]);

    const response = await GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toEqual([]);
    expect(json.data.pagination.hasMore).toBe(false);
    expect(json.data.pagination.nextCursor).toBeNull();
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when a resident requests a unit outside their allowed set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);

    await expect(
      GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&unitId=42`)),
    ).rejects.toThrow('You can only view ARC submissions for your own unit');

    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
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
      makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
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
      GET(makeRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&status=garbage`)),
    ).rejects.toThrow('Invalid ARC status filter');

    expect(paginateMock).not.toHaveBeenCalled();
  });
});
