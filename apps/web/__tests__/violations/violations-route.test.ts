/**
 * Route unit tests — `GET/POST /api/v1/violations`.
 *
 * Plan A1 auto-drain. Paginated GET integration (filter pushdown via the
 * delegating service mock) + POST create auth chain. Errors flow through the
 * real `withErrorHandler` so we assert on HTTP status codes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

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
  parseCommunityIdFromBodyMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  createViolationForCommunityMock,
  unitExistsInCommunityMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  violationsTable: {
    id: Symbol('violations.id'),
    unitId: Symbol('violations.unit_id'),
    status: Symbol('violations.status'),
    severity: Symbol('violations.severity'),
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
  parseCommunityIdFromBodyMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createViolationForCommunityMock: vi.fn(),
  unitExistsInCommunityMock: vi.fn(),
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
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
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
  createViolationForCommunity: createViolationForCommunityMock,
  mapViolationRow: mapViolationRowMock,
  unitExistsInCommunity: unitExistsInCommunityMock,
  // Delegate-style mock mirrors the helper's behavior so assertions on
  // paginateMock.mock.calls[0] / hydrateReportedByRoleMock continue to work.
  paginateViolationsForCommunity: async (params: {
    communityId: number;
    cursor?: string;
    pageSize?: number;
    status?: string;
    severity?: string;
    unitId?: number;
    allowedUnitIds?: number[];
    createdAfter?: string;
    createdBefore?: string;
  }) => {
    if (params.allowedUnitIds && params.allowedUnitIds.length === 0) {
      return {
        data: [],
        pagination: { nextCursor: null, hasMore: false, pageSize: params.pageSize ?? 50 },
      };
    }
    const { eq, and, inArray, gte, lte } = await import('@propertypro/db/filters');
    const clauses: unknown[] = [];
    if (params.status !== undefined) clauses.push(eq(violationsTable.status as never, params.status as never));
    if (params.severity !== undefined) clauses.push(eq(violationsTable.severity as never, params.severity as never));
    if (params.unitId !== undefined) clauses.push(eq(violationsTable.unitId as never, params.unitId as never));
    if (params.allowedUnitIds && params.allowedUnitIds.length > 0) {
      clauses.push(inArray(violationsTable.unitId as never, params.allowedUnitIds as never));
    }
    if (params.createdAfter) {
      clauses.push(gte(violationsTable.createdAt as never, new Date(params.createdAfter) as never));
    }
    if (params.createdBefore) {
      clauses.push(lte(violationsTable.createdAt as never, new Date(params.createdBefore) as never));
    }
    const where =
      clauses.length === 0
        ? undefined
        : clauses.length === 1
          ? clauses[0]
          : and(...(clauses as never[]));
    const result = await paginateMock(
      createScopedClientMock(params.communityId),
      violationsTable,
      { cursor: params.cursor, pageSize: params.pageSize },
      { where },
    );
    const mapped = (result.data as Record<string, unknown>[]).map((r) => mapViolationRowMock(r));
    const hydrated = await hydrateReportedByRoleMock(
      createScopedClientMock(params.communityId),
      mapped,
    );
    return { data: hydrated, pagination: result.pagination };
  },
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

import { GET, POST } from '../../src/app/api/v1/violations/route';

function makeGetRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makePostRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/v1/violations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
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

const CREATE_BODY = {
  communityId: COMMUNITY_ID,
  unitId: 10,
  category: 'Noise',
  description: 'Loud music after 11pm',
  severity: 'moderate',
};

beforeEach(() => {
  vi.clearAllMocks();
  mapViolationRowMock.mockImplementation((row: Record<string, unknown>) => ({ ...row, __mapped: true }));
  hydrateReportedByRoleMock.mockImplementation(async (_s: unknown, rows: Array<Record<string, unknown>>) =>
    rows.map((r) => ({ ...r, __hydrated: true })),
  );
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  parseCommunityIdFromBodyMock.mockImplementation((_req: unknown, id: number) => id);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireViolationsEnabledMock.mockResolvedValue(undefined);
  requirePermissionMock.mockReturnValue(undefined);
  isResidentRoleMock.mockReturnValue(false);
  createScopedClientMock.mockReturnValue(scopedClient);
  getActorUnitIdsMock.mockResolvedValue([10]);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
  unitExistsInCommunityMock.mockResolvedValue(true);
  createViolationForCommunityMock.mockResolvedValue({ id: 1, category: 'Noise' });
});

describe('GET /api/v1/violations', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, status: 'reported', severity: 'minor' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));
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

    await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&status=resolved`));

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

  it('pushes severity filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&severity=major`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: violationsTable.severity, val: 'major' },
    });
  });

  it('combines status + severity + unitId via and()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeGetRequest(
        `/api/v1/violations?communityId=${COMMUNITY_ID}&status=resolved&severity=major&unitId=7`,
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
        { __eq: { col: violationsTable.status, val: 'resolved' } },
        { __eq: { col: violationsTable.severity, val: 'major' } },
        { __eq: { col: violationsTable.unitId, val: 7 } },
      ],
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
      makeGetRequest(
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

  it('confines residents to their allowed unit ids via inArray()', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));

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

    const response = await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toEqual([]);
    expect(json.data.pagination.hasMore).toBe(false);
    expect(json.data.pagination.nextCursor).toBeNull();
    expect(paginateMock).not.toHaveBeenCalled();
    expect(hydrateReportedByRoleMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a resident requests a unit outside their allowed set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);

    const response = await GET(
      makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&unitId=42`),
    );

    expect(response.status).toBe(403);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
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
      makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
  });

  it('returns 400 for an invalid status filter', async () => {
    const response = await GET(
      makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&status=garbage`),
    );

    expect(response.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid severity filter', async () => {
    const response = await GET(
      makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}&severity=catastrophic`),
    );

    expect(response.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query param is missing (BadRequestError preserved)', async () => {
    parseCommunityIdFromQueryMock.mockImplementationOnce(() => {
      throw new BadRequestError('communityId query parameter is required');
    });

    const response = await GET(makeGetRequest('/api/v1/violations'));

    expect(response.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));

    expect(response.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the violations feature gate is denied (permission NOT reached)', async () => {
    requireViolationsEnabledMock.mockRejectedValueOnce(new ForbiddenError('Violations features are not enabled'));

    const response = await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));

    expect(response.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the read permission gate is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const response = await GET(makeGetRequest(`/api/v1/violations?communityId=${COMMUNITY_ID}`));

    expect(response.status).toBe(403);
    expect(paginateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/violations', () => {
  it('creates a violation for a staff actor (unit-exists path)', async () => {
    const response = await POST(makePostRequest(CREATE_BODY, { 'x-request-id': 'req-v-1' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ id: 1, category: 'Noise' });
    expect(unitExistsInCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, 10);
    expect(createViolationForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({ unitId: 10, category: 'Noise', severity: 'moderate' }),
      'req-v-1',
    );
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    await POST(makePostRequest(CREATE_BODY));

    expect(createViolationForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({ unitId: 10 }),
      null,
    );
  });

  it('passes undefined severity through when omitted', async () => {
    const { severity: _omit, ...bodyNoSeverity } = CREATE_BODY;

    await POST(makePostRequest(bodyNoSeverity));

    const call = createViolationForCommunityMock.mock.calls[0] as [
      number,
      string,
      { severity?: unknown },
      unknown,
    ];
    expect(call[2].severity).toBeUndefined();
  });

  it('runs assertNotDemoGrace before requireCommunityMembership', async () => {
    const order: string[] = [];
    assertNotDemoGraceMock.mockImplementationOnce(async () => {
      order.push('demo-grace');
    });
    requireCommunityMembershipMock.mockImplementationOnce(async () => {
      order.push('membership');
      return staffMembership;
    });

    await POST(makePostRequest(CREATE_BODY));

    expect(order).toEqual(['demo-grace', 'membership']);
  });

  it('creates a violation for a resident actor (own-unit path)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10]);

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(200);
    expect(unitExistsInCommunityMock).not.toHaveBeenCalled();
    expect(createViolationForCommunityMock).toHaveBeenCalled();
  });

  it('returns 403 when a resident reports for a unit they do not own', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([11]);

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a resident has no associated units', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([]);

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when a staff actor targets a unit not in the community', async () => {
    unitExistsInCommunityMock.mockResolvedValueOnce(false);

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(404);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is missing required fields', async () => {
    const response = await POST(makePostRequest({ communityId: COMMUNITY_ID }));

    expect(response.status).toBe(400);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when unitId is not a positive integer', async () => {
    const response = await POST(makePostRequest({ ...CREATE_BODY, unitId: 0 }));

    expect(response.status).toBe(400);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is not a positive integer (BadRequestError preserved)', async () => {
    parseCommunityIdFromBodyMock.mockImplementationOnce(() => {
      throw new BadRequestError('communityId must be a positive integer');
    });

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(400);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the violations feature gate is denied (permission NOT reached)', async () => {
    requireViolationsEnabledMock.mockRejectedValueOnce(new ForbiddenError('Violations features are not enabled'));

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the write permission gate is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(createViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('surfaces a NotFoundError from the staff unit check as 404', async () => {
    unitExistsInCommunityMock.mockResolvedValueOnce(false);

    const response = await POST(makePostRequest({ ...CREATE_BODY, unitId: 777 }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error?.message).toBe('Unit 777 not found in this community');
  });
});
