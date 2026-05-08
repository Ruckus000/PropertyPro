/**
 * Unit tests for `/api/v1/violations` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client
 * - Filter pushdown: status, unitId, allowedUnitIds (residents),
 *   createdAfter (gte), createdBefore (lte) → SQL `where`
 * - Resident requesting a unitId outside their allowed set → 403
 * - Resident with zero allowed units → empty paginated envelope (no paginate call)
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 * - `mapViolationRow` normalization + `hydrateReportedByRole` decoration
 *   applied to returned rows
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  violationsTable,
  unitsTable,
  mapViolationRowMock,
  hydrateReportedByRoleMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireViolationsEnabledMock,
  requirePermissionMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  violationsTable: {
    id: Symbol('violations.id'),
    unitId: Symbol('violations.unit_id'),
    status: Symbol('violations.status'),
    createdAt: Symbol('violations.created_at'),
  },
  unitsTable: { id: Symbol('units.id') },
  mapViolationRowMock: vi.fn((row: Record<string, unknown>) => ({ ...row, __mapped: true })),
  hydrateReportedByRoleMock: vi.fn(async (_scoped: unknown, rows: Array<Record<string, unknown>>) =>
    rows.map((r) => ({ ...r, __hydrated: true })),
  ),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  violations: violationsTable,
  units: unitsTable,
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
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
  requireViolationsEnabled: requireViolationsEnabledMock,
}));

vi.mock('@/lib/violations/hydrate-reporter-role', () => ({
  hydrateReportedByRole: hydrateReportedByRoleMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  createViolationForCommunity: vi.fn(),
  mapViolationRow: mapViolationRowMock,
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
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

import { GET } from '../../src/app/api/v1/violations/route';

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
  mapViolationRowMock.mockImplementation((row: Record<string, unknown>) => ({
    ...row,
    __mapped: true,
  }));
  hydrateReportedByRoleMock.mockImplementation(async (_s: unknown, rows: Array<Record<string, unknown>>) =>
    rows.map((r) => ({ ...r, __hydrated: true })),
  );
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireViolationsEnabledMock.mockResolvedValue(undefined);
  requirePermissionMock.mockReturnValue(undefined);
  isResidentRoleMock.mockReturnValue(false);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/violations — paginate() integration', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, status: 'reported', severity: 'minor' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0].__mapped).toBe(true);
    expect(json.data.data[0].__hydrated).toBe(true);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(violationsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    expect(options.where).toBeUndefined();
  });

  it('pushes status filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&status=resolved`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: violationsTable.status, val: 'resolved' },
    });
  });

  it('pushes unitId filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&unitId=42`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: violationsTable.unitId, val: 42 },
    });
  });

  it('pushes createdAfter/createdBefore date range into gte/lte predicates', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const after = '2025-01-01T00:00:00Z';
    const before = '2025-06-30T23:59:59Z';
    await GET(
      makeRequest(
        `/api/v1/violations?communityId=${COMMUNITY_ID}&createdAfter=${encodeURIComponent(after)}&createdBefore=${encodeURIComponent(before)}`,
      ),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: { __and: unknown[] } },
    ];
    expect(options.where).toEqual({
      __and: [
        { __gte: { col: violationsTable.createdAt, val: new Date(after) } },
        { __lte: { col: violationsTable.createdAt, val: new Date(before) } },
      ],
    });
  });

  it('combines status + unitId via and()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&status=resolved&unitId=7`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: { __and: unknown[] } },
    ];
    expect(options.where).toEqual({
      __and: [
        { __eq: { col: violationsTable.status, val: 'resolved' } },
        { __eq: { col: violationsTable.unitId, val: 7 } },
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

    await GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __inArray: { col: violationsTable.unitId, vals: [10, 11] },
    });
  });

  it('returns an empty paginated envelope for a resident with zero allowed units (no paginate call)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([]);

    const response = await GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toEqual([]);
    expect(json.data.pagination.hasMore).toBe(false);
    expect(json.data.pagination.nextCursor).toBeNull();
    expect(paginateMock).not.toHaveBeenCalled();
    expect(hydrateReportedByRoleMock).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when a resident requests a unit outside their allowed set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);

    await expect(
      GET(makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&unitId=42`)),
    ).rejects.toThrow('You can only view violations for your own unit');

    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
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
      makeRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
  });
});
