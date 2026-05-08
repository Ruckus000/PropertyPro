/**
 * Unit tests for `/api/v1/polls` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client
 * - Default `isActive=true` always included in the where predicate
 * - `includeEnded=false` (default) adds the
 *   `or(isNull(endsAt), gt(endsAt, now))` clause via SQL pushdown — replacing
 *   the previous JS-side post-fetch filter on `endsAt`
 * - `includeEnded=true` omits the endsAt clause
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 * - `mapPollRow` normalization applied to returned rows
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  pollsTable,
  mapPollRowMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePollsEnabledMock,
  requirePollReadPermissionMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  pollsTable: {
    id: Symbol('polls.id'),
    isActive: Symbol('polls.is_active'),
    endsAt: Symbol('polls.ends_at'),
  },
  mapPollRowMock: vi.fn((row: Record<string, unknown>) => ({ ...row, __mapped: true })),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePollsEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  polls: pollsTable,
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  isNull: (col: unknown) => ({ __isNull: { col } }),
  gt: (col: unknown, val: unknown) => ({ __gt: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
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

vi.mock('@/lib/polls/common', () => ({
  requirePollsEnabled: requirePollsEnabledMock,
  requirePollReadPermission: requirePollReadPermissionMock,
  requirePollWritePermission: vi.fn(),
  requirePollCreatorRole: vi.fn(),
}));

vi.mock('@/lib/services/polls-service', () => ({
  createPollForCommunity: vi.fn(),
  mapPollRow: mapPollRowMock,
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

import { GET } from '../../src/app/api/v1/polls/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const membership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

beforeEach(() => {
  vi.clearAllMocks();
  mapPollRowMock.mockImplementation((row: Record<string, unknown>) => ({
    ...row,
    __mapped: true,
  }));
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requirePollsEnabledMock.mockReturnValue(undefined);
  requirePollReadPermissionMock.mockReturnValue(undefined);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/polls — paginate() integration', () => {
  it('default: isActive=true + non-ended filter pushed into where via and(), mapPollRow applied', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, title: 'P1', isActive: true }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeRequest(`/api/v1/polls?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0].__mapped).toBe(true);

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where: { __and: unknown[] } },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(pollsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });

    // Two clauses AND-ed: isActive=true + or(isNull(endsAt), gt(endsAt, now))
    expect(options.where.__and).toHaveLength(2);
    expect(options.where.__and[0]).toEqual({
      __eq: { col: pollsTable.isActive, val: true },
    });
    const endsAtClause = options.where.__and[1] as { __or: unknown[] };
    expect(endsAtClause.__or).toHaveLength(2);
    expect(endsAtClause.__or[0]).toEqual({ __isNull: { col: pollsTable.endsAt } });
    const gtClause = endsAtClause.__or[1] as { __gt: { col: unknown; val: Date } };
    expect(gtClause.__gt.col).toBe(pollsTable.endsAt);
    expect(gtClause.__gt.val).toBeInstanceOf(Date);
  });

  it('includeEnded=true omits the endsAt clause and pushes only isActive=true', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/polls?communityId=${COMMUNITY_ID}&includeEnded=true`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    // Single clause — paginate's where is the eq() directly, not wrapped in and()
    expect(options.where).toEqual({
      __eq: { col: pollsTable.isActive, val: true },
    });
  });

  it('isActive=false flips the isActive predicate and still applies endsAt filter', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/polls?communityId=${COMMUNITY_ID}&isActive=false`),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: { __and: unknown[] } },
    ];
    expect(options.where.__and[0]).toEqual({
      __eq: { col: pollsTable.isActive, val: false },
    });
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(`/api/v1/polls?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
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
      makeRequest(`/api/v1/polls?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
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
