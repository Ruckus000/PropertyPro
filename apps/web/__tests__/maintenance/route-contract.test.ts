/**
 * Wire-format + auth-gate pins for `/api/v1/maintenance-requests` (GET + POST).
 *
 * CON-05 (Phase 3.5): this route moved from a hand-rolled `withErrorHandler`
 * handler onto `runRoute(contract, handler)`. These tests were written and run
 * green (36/36) against the PRE-migration route first, so every exact-bytes
 * assertion below is the pre-migration wire format. The only cases edited
 * after the drain are the two GET error-path deltas that declaring
 * `tenantScope: { in: 'query' }` introduces, each marked `TENANTSCOPE DELTA`
 * with the legacy behavior it replaced (see `contract.ts`). Pinned:
 *
 *   - success envelopes (GET paginated double-wrap, POST single-wrap), key order
 *     included, and `Date` → ISO serialization
 *   - error envelopes (401 / 400 / 403 / 404 / 500), including the absence of a
 *     `details` block where the legacy handler threw a bare `ValidationError`
 *   - gate ORDER: auth runs before any query/body validation, so an
 *     unauthenticated caller with a bad request still sees 401
 *   - audit-log payloads, byte-for-byte
 *
 * The service layer is mocked at the module boundary
 * (`@/lib/services/maintenance-request-service`) so call-arg assertions read
 * the route's contract with the service directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';

const {
  createScopedClientMock,
  logAuditEventMock,
  createPresignedDownloadUrlMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  requirePlanFeatureMock,
  requireEntitledForAdminReadMock,
  assertNotDemoGraceMock,
  getFeaturesForCommunityMock,
  getMaintenancePhotoUploadUrlMock,
  processAndStoreThumbnailMock,
  paginateServiceMock,
  listCommentsMock,
  getRequestByIdMock,
  getUnitByIdMock,
  createRequestMock,
  createCommentMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  getMaintenancePhotoUploadUrlMock: vi.fn(),
  processAndStoreThumbnailMock: vi.fn(),
  paginateServiceMock: vi.fn(),
  listCommentsMock: vi.fn(),
  getRequestByIdMock: vi.fn(),
  getUnitByIdMock: vi.fn(),
  createRequestMock: vi.fn(),
  createCommentMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/photo-processor', () => ({
  getMaintenancePhotoUploadUrl: getMaintenancePhotoUploadUrlMock,
  processAndStoreThumbnail: processAndStoreThumbnailMock,
}));

vi.mock('@/lib/services/maintenance-request-service', () => ({
  paginateMaintenanceRequestsForCommunity: paginateServiceMock,
  listMaintenanceCommentsForRequests: listCommentsMock,
  getMaintenanceRequestById: getRequestByIdMock,
  getMaintenanceRequestUnitById: getUnitByIdMock,
  createMaintenanceRequestForCommunity: createRequestMock,
  createMaintenanceCommentForRequest: createCommentMock,
}));

import { GET, POST } from '../../src/app/api/v1/maintenance-requests/route';

const BASE = 'http://localhost:3000/api/v1/maintenance-requests';
const SCOPED = { __scoped: 42 };
const ACTOR = 'user-actor-1';

const STAFF = {
  userId: ACTOR,
  communityId: 42,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};
const RESIDENT = { ...STAFF, role: 'resident', isAdmin: false, isUnitOwner: true };

const CREATED_AT = new Date('2026-09-01T12:00:00.000Z');
const UPDATED_AT = new Date('2026-09-02T08:30:00.000Z');

function get(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE}${query}`, { headers });
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Forbid exactly one `requirePermission(…, 'maintenance', action)` call. */
function denyPermission(action: 'read' | 'write') {
  requirePermissionMock.mockImplementation((_m: unknown, resource: string, a: string) => {
    if (resource === 'maintenance' && a === action) {
      throw new ForbiddenError(`You do not have ${a} permission for ${resource}`);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
  requireCommunityMembershipMock.mockResolvedValue(STAFF);
  requirePermissionMock.mockImplementation(() => {});
  requirePlanFeatureMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  getFeaturesForCommunityMock.mockReturnValue({ hasMaintenanceRequests: true });
  createScopedClientMock.mockReturnValue(SCOPED);
  logAuditEventMock.mockResolvedValue(undefined);
  createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed/p1');
  processAndStoreThumbnailMock.mockResolvedValue(undefined);
  getMaintenancePhotoUploadUrlMock.mockResolvedValue({
    uploadUrl: 'https://storage.example.com/upload',
    storagePath: 'communities/42/maintenance/tmp/photo.jpg',
  });
  paginateServiceMock.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
  listCommentsMock.mockResolvedValue([]);
  getRequestByIdMock.mockResolvedValue(null);
  getUnitByIdMock.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/maintenance-requests — wire format', () => {
  const row = {
    id: 7,
    communityId: 42,
    unitId: 3,
    unitLabel: '4B',
    submittedById: 'user-res-9',
    title: 'Leak',
    description: 'Under sink',
    status: 'open',
    priority: 'normal',
    category: 'plumbing',
    assignedToId: null,
    resolutionDescription: null,
    resolutionDate: null,
    photos: null,
    internalNotes: 'call vendor',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
  const comments = [
    { id: 1, requestId: 7, userId: 'u1', text: 'public', isInternal: false, createdAt: CREATED_AT },
    { id: 2, requestId: 7, userId: 'u2', text: 'staff only', isInternal: true, createdAt: UPDATED_AT },
  ];

  it('staff: exact double-wrapped paginated bytes, service call args, and gate args', async () => {
    paginateServiceMock.mockResolvedValue({
      data: [row],
      pagination: { nextCursor: 'CUR2', hasMore: true, pageSize: 10 },
    });
    listCommentsMock.mockResolvedValue(comments);

    const res = await GET(
      get('?communityId=42&status=open&category=plumbing&priority=high&assignedToId=staff-1&cursor=CUR1&pageSize=10'),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"data":[{"id":7,"communityId":42,"unitId":3,"unitLabel":"4B","submittedById":"user-res-9",' +
        '"title":"Leak","description":"Under sink","status":"submitted","priority":"medium","category":"plumbing",' +
        '"assignedToId":null,"resolutionDescription":null,"resolutionDate":null,"photos":null,' +
        '"createdAt":"2026-09-01T12:00:00.000Z","updatedAt":"2026-09-02T08:30:00.000Z","comments":[' +
        '{"id":1,"requestId":7,"userId":"u1","text":"public","createdAt":"2026-09-01T12:00:00.000Z","isInternal":false},' +
        '{"id":2,"requestId":7,"userId":"u2","text":"staff only","createdAt":"2026-09-02T08:30:00.000Z","isInternal":true}],' +
        '"internalNotes":"call vendor"}],"pagination":{"nextCursor":"CUR2","hasMore":true,"pageSize":10}}}',
    );

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(getFeaturesForCommunityMock).toHaveBeenCalledWith('condo_718');
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasMaintenanceRequests');
    expect(requirePermissionMock).toHaveBeenCalledWith(STAFF, 'maintenance', 'read');
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(42, STAFF);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(paginateServiceMock).toHaveBeenCalledWith({
      scoped: SCOPED,
      actorUserId: ACTOR,
      isResident: false,
      isStaff: true,
      cursor: 'CUR1',
      pageSize: 10,
      statusFilter: 'open',
      categoryFilter: 'plumbing',
      priorityFilter: 'high',
      assignedToIdFilter: 'staff-1',
    });
    expect(listCommentsMock).toHaveBeenCalledWith(SCOPED, [7]);
  });

  it('resident: internal comments + internalNotes + isInternal key all stripped', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);
    paginateServiceMock.mockResolvedValue({
      data: [row],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
    listCommentsMock.mockResolvedValue(comments);

    const res = await GET(get('?communityId=42'));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"data":[{"id":7,"communityId":42,"unitId":3,"unitLabel":"4B","submittedById":"user-res-9",' +
        '"title":"Leak","description":"Under sink","status":"submitted","priority":"medium","category":"plumbing",' +
        '"assignedToId":null,"resolutionDescription":null,"resolutionDate":null,"photos":null,' +
        '"createdAt":"2026-09-01T12:00:00.000Z","updatedAt":"2026-09-02T08:30:00.000Z","comments":[' +
        '{"id":1,"requestId":7,"userId":"u1","text":"public","createdAt":"2026-09-01T12:00:00.000Z"}]}],' +
        '"pagination":{"nextCursor":null,"hasMore":false,"pageSize":50}}}',
    );
    // Absent filters reach the service as null (URLSearchParams.get semantics).
    expect(paginateServiceMock).toHaveBeenCalledWith({
      scoped: SCOPED,
      actorUserId: ACTOR,
      isResident: true,
      isStaff: false,
      cursor: undefined,
      pageSize: undefined,
      statusFilter: null,
      categoryFilter: null,
      priorityFilter: null,
      assignedToIdFilter: null,
    });
  });

  it('empty-string filters reach the service as "" (unchanged URLSearchParams semantics)', async () => {
    await GET(get('?communityId=42&status=&category=&cursor=&pageSize='));
    expect(paginateServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: undefined,
        pageSize: undefined,
        statusFilter: '',
        categoryFilter: '',
        priorityFilter: null,
        assignedToIdFilter: null,
      }),
    );
  });

  it('401 when unauthenticated — exact bytes', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(
      '{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}',
    );
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('401 precedes cursor/pageSize validation (auth runs first)', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const badPage = await GET(get('?communityId=42&pageSize=-3'));
    expect(badPage.status).toBe(401);
  });

  // TENANTSCOPE DELTA (order): legacy returned 401 for all three — auth ran
  // before any communityId handling. The runner now resolves tenancy first.
  it('tenant resolution precedes auth: bad/missing/mismatched communityId beats 401', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    expect((await GET(get(''))).status).toBe(400);
    expect((await GET(get('?communityId=abc'))).status).toBe(400);
    expect((await GET(get('?communityId=42', { 'x-community-id': '7' }))).status).toBe(404);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  // TENANTSCOPE DELTA (message): legacy body was
  // '{"error":{"code":"VALIDATION_ERROR","message":"communityId query parameter is required"}}'.
  it('400 when communityId is missing and no header — exact bytes', async () => {
    const res = await GET(get(''));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid or missing communityId"}}',
    );
  });

  it('400 with the legacy message when only the header carries the community', async () => {
    const res = await GET(get('', { 'x-community-id': '42' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"communityId query parameter is required"}}',
    );
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('400 when communityId is not a positive integer — exact bytes', async () => {
    for (const bad of ['abc', '0', '-4', '1.5']) {
      const res = await GET(get(`?communityId=${bad}`));
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(
        '{"error":{"code":"VALIDATION_ERROR","message":"communityId must be a positive integer"}}',
      );
    }
  });

  it('400 on invalid cursor/pageSize — exact bytes, no details block', async () => {
    for (const q of ['&pageSize=-1', '&pageSize=abc', `&cursor=${'x'.repeat(257)}`]) {
      const res = await GET(get(`?communityId=42${q}`));
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(
        '{"error":{"code":"VALIDATION_ERROR","message":"Invalid query parameters"}}',
      );
    }
    expect(paginateServiceMock).not.toHaveBeenCalled();
  });

  it('404 when x-community-id header disagrees with ?communityId', async () => {
    const res = await GET(get('?communityId=42', { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Community not found"}}');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('header is authoritative when it agrees', async () => {
    await GET(get('?communityId=42', { 'x-community-id': '42' }));
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
  });

  it('403 when the community type has no maintenance requests — exact bytes', async () => {
    getFeaturesForCommunityMock.mockReturnValue({ hasMaintenanceRequests: false });
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"Maintenance requests are not enabled for this community type"}}',
    );
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
  });

  it('403 when the plan lacks the feature', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('Upgrade required'));
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('403 when requirePermission(maintenance, read) denies', async () => {
    denyPermission('read');
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You do not have read permission for maintenance"}}',
    );
    expect(paginateServiceMock).not.toHaveBeenCalled();
  });

  it('403 when the admin-read entitlement guard denies', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(new ForbiddenError('Subscription lapsed'));
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(paginateServiceMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

describe('POST /api/v1/maintenance-requests — action: create', () => {
  const body = {
    action: 'create',
    communityId: 42,
    title: 'Leak',
    description: 'Under sink',
    category: 'plumbing',
    priority: 'emergency',
    unitId: 3,
    unitLabel: ' 4B ',
    storagePaths: ['maintenance/42/tmp/p1.jpg'],
  };

  it('exact single-wrap bytes, service args, and audit payload', async () => {
    getUnitByIdMock.mockResolvedValue({ id: 3 });
    createRequestMock.mockResolvedValue({
      id: 99,
      communityId: 42,
      title: 'Leak',
      status: 'submitted',
      createdAt: CREATED_AT,
    });

    const res = await POST(post(body));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"id":99,"communityId":42,"title":"Leak","status":"submitted","createdAt":"2026-09-01T12:00:00.000Z"}}',
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requirePermissionMock).toHaveBeenCalledWith(STAFF, 'maintenance', 'write');
    expect(getUnitByIdMock).toHaveBeenCalledWith(SCOPED, 3);
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'maintenance',
      'maintenance/42/tmp/p1.jpg',
    );
    expect(createRequestMock).toHaveBeenCalledWith(SCOPED, {
      submittedById: ACTOR,
      unitId: 3,
      unitLabel: '4B',
      title: 'Leak',
      description: 'Under sink',
      category: 'plumbing',
      priority: 'urgent',
      status: 'submitted',
      photos: [
        {
          url: 'https://storage.example.com/signed/p1',
          thumbnailUrl: null,
          storagePath: 'maintenance/42/tmp/p1.jpg',
          uploadedAt: expect.any(String),
        },
      ],
    });
    expect(processAndStoreThumbnailMock).toHaveBeenCalledWith(
      'maintenance/42/tmp/p1.jpg',
      42,
      99,
    );
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: ACTOR,
      action: 'create',
      resourceType: 'maintenance_request',
      resourceId: '99',
      communityId: 42,
      newValues: { title: 'Leak', category: 'plumbing', priority: 'urgent', photoCount: 1 },
    });
  });

  it('400 on an invalid payload — exact bytes with field details', async () => {
    const res = await POST(post({ action: 'create', communityId: 42, title: '', unitLabel: '4B' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid request payload","details":{"fields":[' +
        '{"field":"title","message":"Too small: expected string to have >=1 characters"},' +
        '{"field":"description","message":"Invalid input: expected string, received undefined"}]}}}',
    );
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('400 when the unit is not in this community', async () => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Unit not found in this community"}}',
    );
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('403 when requirePermission(maintenance, write) denies', async () => {
    denyPermission('write');
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(createRequestMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('403 when the community type has no maintenance requests', async () => {
    getFeaturesForCommunityMock.mockReturnValue({ hasMaintenanceRequests: false });
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('demo-grace refusal fires before the membership check', async () => {
    assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo expired'));
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('404 when x-community-id header disagrees with body.communityId', async () => {
    const res = await POST(post(body, { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Community not found"}}');
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — add_comment
// ---------------------------------------------------------------------------

describe('POST /api/v1/maintenance-requests — action: add_comment', () => {
  const body = { action: 'add_comment', communityId: 42, requestId: 7, text: 'On it', isInternal: true };

  it('staff: exact bytes, service args, audit payload', async () => {
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: 'someone-else' });
    createCommentMock.mockResolvedValue({ id: 501, requestId: 7, text: 'On it', createdAt: CREATED_AT });

    const res = await POST(post(body));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"id":501,"requestId":7,"text":"On it","createdAt":"2026-09-01T12:00:00.000Z"}}',
    );
    expect(getRequestByIdMock).toHaveBeenCalledWith(SCOPED, 7);
    expect(createCommentMock).toHaveBeenCalledWith(SCOPED, {
      requestId: 7,
      userId: ACTOR,
      text: 'On it',
      isInternal: true,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: ACTOR,
      action: 'create',
      resourceType: 'maintenance_comment',
      resourceId: '501',
      communityId: 42,
      newValues: { requestId: 7, isInternal: true },
    });
  });

  it('resident on own request: isInternal forced false', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: ACTOR });
    createCommentMock.mockResolvedValue({ id: 502 });
    const res = await POST(post(body));
    expect(res.status).toBe(200);
    expect(createCommentMock).toHaveBeenCalledWith(SCOPED, expect.objectContaining({ isInternal: false }));
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ newValues: { requestId: 7, isInternal: false } }),
    );
  });

  it('403 when a resident comments on someone else’s request — exact bytes', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: 'someone-else' });
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You can only comment on your own requests"}}',
    );
    expect(createCommentMock).not.toHaveBeenCalled();
  });

  it('403 when requirePermission(maintenance, write) denies', async () => {
    denyPermission('write');
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(getRequestByIdMock).not.toHaveBeenCalled();
  });

  it('400 on an invalid payload — exact bytes', async () => {
    const res = await POST(post({ action: 'add_comment', communityId: 42, requestId: 7 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid comment payload","details":{"fields":[' +
        '{"field":"text","message":"Invalid input: expected string, received undefined"}]}}}',
    );
  });

  it('400 when the request is not in this community', async () => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Maintenance request not found in this community"}}',
    );
  });
});

// ---------------------------------------------------------------------------
// POST — request_upload_url
// ---------------------------------------------------------------------------

describe('POST /api/v1/maintenance-requests — action: request_upload_url', () => {
  const body = {
    action: 'request_upload_url',
    communityId: 42,
    requestId: 7,
    filename: 'photo.jpg',
    fileSize: 2048,
    mimeType: 'image/jpeg',
  };

  it('exact bytes and service args', async () => {
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: ACTOR, photos: [] });
    const res = await POST(post(body));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"uploadUrl":"https://storage.example.com/upload","storagePath":"communities/42/maintenance/tmp/photo.jpg"}}',
    );
    expect(getMaintenancePhotoUploadUrlMock).toHaveBeenCalledWith(42, 7, 'photo.jpg');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('without requestId: no ownership lookup, null forwarded', async () => {
    const { requestId: _omit, ...noId } = body;
    const res = await POST(post(noId));
    expect(res.status).toBe(200);
    expect(getRequestByIdMock).not.toHaveBeenCalled();
    expect(getMaintenancePhotoUploadUrlMock).toHaveBeenCalledWith(42, null, 'photo.jpg');
  });

  it('403 when a resident uploads to someone else’s request — exact bytes', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: 'someone-else', photos: null });
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You can only upload photos to your own requests"}}',
    );
    expect(getMaintenancePhotoUploadUrlMock).not.toHaveBeenCalled();
  });

  it('403 when requirePermission(maintenance, write) denies', async () => {
    denyPermission('write');
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(getMaintenancePhotoUploadUrlMock).not.toHaveBeenCalled();
  });

  it('400 PHOTO_LIMIT_EXCEEDED for a resident at 5 photos — exact bytes', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT);
    getRequestByIdMock.mockResolvedValue({ id: 7, submittedById: ACTOR, photos: [1, 2, 3, 4, 5] });
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Maximum of 5 photos allowed per request",' +
        '"details":{"code":"PHOTO_LIMIT_EXCEEDED"}}}',
    );
  });

  it('400 on an oversize file — exact bytes', async () => {
    const res = await POST(post({ ...body, fileSize: 10 * 1024 * 1024 + 1 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid upload URL request","details":{"fields":[' +
        '{"field":"fileSize","message":"Too big: expected number to be <=10485760"}]}}}',
    );
  });
});

// ---------------------------------------------------------------------------
// POST — dispatch-level behavior
// ---------------------------------------------------------------------------

describe('POST /api/v1/maintenance-requests — dispatch', () => {
  it('401 when unauthenticated, before any body validation — exact bytes', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    for (const body of [{ action: 'create', communityId: 42 }, { action: 'nope' }, {}]) {
      const res = await POST(post(body));
      expect(res.status).toBe(401);
      expect(await res.text()).toBe(
        '{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}',
      );
    }
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('400 on an unknown or missing action — exact bytes', async () => {
    for (const body of [{ action: 'delete_everything', communityId: 42 }, { communityId: 42 }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(
        '{"error":{"code":"VALIDATION_ERROR","message":"Unknown action. Valid actions: create, add_comment, request_upload_url"}}',
      );
    }
  });

  it('500 on a malformed JSON body — exact bytes (unchanged legacy behavior)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post('{not json'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(
      '{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}',
    );
    spy.mockRestore();
  });
});
