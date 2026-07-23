/**
 * Unit tests for `/api/v1/maintenance-requests` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client
 * - Filter pushdown: status, category, priority, assignedToId
 * - Resident scope auto-applied: `submittedById = actorUserId`
 * - cursor + pageSize forwarded to paginate()
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 * - Per-page comment fetch via inArray(maintenanceComments.requestId, pagedIds)
 * - Resident comments filtered to non-internal only
 * - formatRequest applied per row
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  selectFromMock,
  createScopedClientMock,
  maintenanceRequestsTable,
  maintenanceCommentsTable,
  unitsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true } as unknown as { selectFrom: ReturnType<typeof vi.fn> },
  selectFromMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  maintenanceRequestsTable: {
    id: Symbol('mr.id'),
    submittedById: Symbol('mr.submitted_by_id'),
    status: Symbol('mr.status'),
    category: Symbol('mr.category'),
    priority: Symbol('mr.priority'),
    assignedToId: Symbol('mr.assigned_to_id'),
  },
  maintenanceCommentsTable: { requestId: Symbol('mc.request_id') },
  unitsTable: { id: Symbol('units.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  createPresignedDownloadUrl: vi.fn(),
  logAuditEvent: vi.fn(),
  maintenanceRequests: maintenanceRequestsTable,
  maintenanceComments: maintenanceCommentsTable,
  paginate: paginateMock,
  units: unitsTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: vi.fn(() => ({ hasMaintenanceRequests: true })),
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

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/photo-processor', () => ({
  getMaintenancePhotoUploadUrl: vi.fn(),
  processAndStoreThumbnail: vi.fn(),
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

import { GET } from '../../src/app/api/v1/maintenance-requests/route';

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
  role: 'resident',
  isAdmin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requirePermissionMock.mockReturnValue(undefined);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  // Default: empty comments fetch (selectFrom returns []).
  selectFromMock.mockResolvedValue([]);
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
  });
});

describe('GET /api/v1/maintenance-requests — paginate() integration', () => {
  it('returns paginated rows with no filters when staff has no query params', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [
        { id: 1, submittedById: 'u1', title: 'A', status: 'submitted', priority: 'normal' },
        { id: 2, submittedById: 'u2', title: 'B', status: 'open', priority: 'high' },
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(2);
    // formatRequest normalizes status 'open' → 'submitted'
    expect(json.data.data[1].status).toBe('submitted');
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    const [, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(table).toBe(maintenanceRequestsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    expect(options.where).toBeUndefined();
  });

  it('residents are auto-scoped to their own submissions', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-tenant');
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}`));

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: maintenanceRequestsTable.submittedById, val: 'user-tenant' },
    });
  });

  it('combines status + category + priority filters via and()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(
        `/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}&status=in_progress&category=plumbing&priority=high`,
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
        { __eq: { col: maintenanceRequestsTable.status, val: 'in_progress' } },
        { __eq: { col: maintenanceRequestsTable.category, val: 'plumbing' } },
        { __eq: { col: maintenanceRequestsTable.priority, val: 'high' } },
      ],
    });
  });

  it('staff can filter by assignedToId; residents cannot', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(
        `/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}&assignedToId=user-tech-1`,
      ),
    );

    const [, , , options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(options.where).toEqual({
      __eq: { col: maintenanceRequestsTable.assignedToId, val: 'user-tech-1' },
    });

    // Now resident with same query: assignedToId filter must NOT be applied,
    // only the auto-scope `submittedById = actorUserId`.
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-tenant');
    await GET(
      makeRequest(
        `/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}&assignedToId=user-tech-1`,
      ),
    );
    const [, , , residentOptions] = paginateMock.mock.calls[1] as [
      unknown,
      unknown,
      unknown,
      { where: unknown },
    ];
    expect(residentOptions.where).toEqual({
      __eq: { col: maintenanceRequestsTable.submittedById, val: 'user-tenant' },
    });
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(
        `/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`,
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
      makeRequest(`/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
  });

  it('fetches comments only for the page IDs and filters internal comments out for residents', async () => {
    requireCommunityMembershipMock.mockResolvedValue(residentMembership);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-tenant');
    paginateMock.mockResolvedValueOnce({
      data: [
        { id: 7, submittedById: 'user-tenant', title: 'X', status: 'submitted', priority: 'normal' },
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
    selectFromMock.mockResolvedValueOnce([
      { id: 100, requestId: 7, userId: 'staff', text: 'public', isInternal: false, createdAt: '2025-01-01' },
      { id: 101, requestId: 7, userId: 'staff', text: 'private', isInternal: true, createdAt: '2025-01-02' },
    ]);

    const response = await GET(
      makeRequest(`/api/v1/maintenance-requests?communityId=${COMMUNITY_ID}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    // Resident sees only the non-internal comment.
    expect(json.data.data[0].comments).toHaveLength(1);
    expect(json.data.data[0].comments[0].text).toBe('public');

    // selectFrom called with inArray(comments.requestId, [7])
    expect(selectFromMock).toHaveBeenCalledWith(
      maintenanceCommentsTable,
      {},
      { __inArray: { col: maintenanceCommentsTable.requestId, vals: [7] } },
    );
  });
});
