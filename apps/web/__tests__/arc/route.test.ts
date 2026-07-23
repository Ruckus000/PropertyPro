/**
 * Route unit tests — `GET/POST /api/v1/arc`.
 *
 * Plan A1 drain #173. Paginated GET integration + POST create auth chain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

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
  requireArcSubmitterRoleMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  createArcSubmissionForCommunityMock,
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
  requireArcSubmitterRoleMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createArcSubmissionForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
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
  isResidentRole: isResidentRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
  requireArcEnabled: requireArcEnabledMock,
  requireArcSubmitterRole: requireArcSubmitterRoleMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  createArcSubmissionForCommunity: createArcSubmissionForCommunityMock,
  mapArcRow: mapArcRowMock,
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
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '../../src/app/api/v1/arc/route';

function makeGetRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makePostRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/v1/arc', {
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
  title: 'Fence replacement',
  description: 'Replace rear fence with vinyl',
  projectType: 'exterior',
};

beforeEach(() => {
  vi.clearAllMocks();
  mapArcRowMock.mockImplementation((row: Record<string, unknown>) => ({ ...row, __mapped: true }));
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireArcEnabledMock.mockResolvedValue(undefined);
  requirePermissionMock.mockReturnValue(undefined);
  requireArcSubmitterRoleMock.mockReturnValue(undefined);
  isResidentRoleMock.mockReturnValue(false);
  createScopedClientMock.mockReturnValue(scopedClient);
  getActorUnitIdsMock.mockResolvedValue([10]);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  createArcSubmissionForCommunityMock.mockResolvedValue({ id: 1, title: 'Fence replacement' });
});

describe('GET /api/v1/arc', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1, status: 'submitted', attachmentDocumentIds: [10] }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeGetRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0].__mapped).toBe(true);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.any(Request), COMMUNITY_ID);
  });

  it('pushes status filter into the where predicate', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeGetRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&status=approved`));

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

  it('returns 403 when a resident requests a unit outside their allowed set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([10, 11]);

    const response = await GET(
      makeGetRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&unitId=42`),
    );

    expect(response.status).toBe(403);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns an empty paginated envelope for a resident with zero allowed units', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    isResidentRoleMock.mockReturnValue(true);
    getActorUnitIdsMock.mockResolvedValue([]);

    const response = await GET(makeGetRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toEqual([]);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status filter', async () => {
    const response = await GET(
      makeGetRequest(`/api/v1/arc?communityId=${COMMUNITY_ID}&status=garbage`),
    );

    expect(response.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/arc', () => {
  it('creates an ARC submission for the actor unit', async () => {
    const response = await POST(
      makePostRequest(CREATE_BODY, { 'x-request-id': 'req-arc-1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ id: 1, title: 'Fence replacement' });
    expect(createArcSubmissionForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({ unitId: 10, title: 'Fence replacement' }),
      'req-arc-1',
    );
  });

  it('returns 403 when the actor unit is not in allowed units', async () => {
    getActorUnitIdsMock.mockResolvedValueOnce([99]);

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(createArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(createArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is invalid', async () => {
    const response = await POST(makePostRequest({ communityId: COMMUNITY_ID }));

    expect(response.status).toBe(400);
    expect(createArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when arc submitter role is denied', async () => {
    requireArcSubmitterRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const response = await POST(makePostRequest(CREATE_BODY));

    expect(response.status).toBe(403);
    expect(createArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });
});
