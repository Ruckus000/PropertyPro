/**
 * Unit tests for `/api/v1/visitors/denied` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client
 * - `active` filter pushed into the SQL `where` predicate (true / false / absent)
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  deniedVisitorsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermissionMock,
  requireStaffOperatorMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  deniedVisitorsTable: {
    id: Symbol('denied_visitors.id'),
    isActive: Symbol('denied_visitors.is_active'),
  },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  deniedVisitors: deniedVisitorsTable,
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
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
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
  requireVisitorsWritePermission: vi.fn(),
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  createDeniedVisitor: vi.fn(),
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
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

import { GET } from '../../src/app/api/v1/visitors/denied/route';

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

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
  requireVisitorsReadPermissionMock.mockReturnValue(undefined);
  requireStaffOperatorMock.mockReturnValue(undefined);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/visitors/denied — paginate() integration', () => {
  it('returns paginated rows with no `where` when no `active` param is passed', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, fullName: 'A', isActive: true }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(deniedVisitorsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    expect(options.where).toBeUndefined();
  });

  it('pushes `active=true` into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=true`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: deniedVisitorsTable.isActive, val: true },
    });
  });

  it('pushes `active=false` into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=false`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: deniedVisitorsTable.isActive, val: false },
    });
  });

  it('treats unknown `active` values as absent (no where predicate)', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=garbage`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    // `active` only accepts the literal strings 'true' / 'false'. Anything
    // else (including 'garbage') falls back to undefined → no where predicate.
    expect(options.where).toBeUndefined();
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(
        `/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`,
      ),
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
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
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
