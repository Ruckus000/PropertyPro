/**
 * Wire-format + auth-gate pins for `/api/v1/announcements` (GET, POST, DELETE).
 *
 * CON-05 (Phase 3.5): this route moved from hand-rolled `withErrorHandler` +
 * `withAuditLog` handlers onto `runRoute(contract, handler)`. These tests were
 * written and run green (63/63) against the PRE-migration route first, so every
 * exact-bytes assertion below is the pre-migration wire format. The only cases
 * edited after the drain are the deltas listed in `contract.ts`: GET error
 * paths from declaring `tenantScope: { in: 'query' }` (marked `TENANTSCOPE
 * DELTA`) and `assertNotDemoGrace` moving after auth on POST/DELETE (marked
 * `DEMO-GRACE ORDER DELTA`), each quoting the legacy behaviour it replaced.
 * Cases ADDED after the drain pin behaviour the legacy handler shared. Pinned:
 *
 *   - success envelopes, key order included: GET `{ data: { data, pagination } }`
 *     (pagination omitted when the service returns none), POST / DELETE `{ data }`
 *   - error envelopes (401 / 400 / 403 / 404 / 500), including the per-action
 *     `VALIDATION_ERROR` message + `details.fields`
 *   - gate ORDER (GET: tenant resolution, then auth, then query validation;
 *     POST/DELETE: body communityId parse before auth, demo-grace after auth
 *     and before membership, permission before subscription)
 *   - audit-log payloads, byte-for-byte (`JSON.stringify` of every
 *     `logAuditEvent` call, so key order and the `requestId` stamp count)
 *
 * Only services and gates are mocked. The runner, `resolveEffectiveCommunityId`,
 * the real audit middleware (`createAuditContext`),
 * `formatZodErrors` and `sanitizeHtml` all run for real; `logAuditEvent` is the
 * mocked sink the audit context writes to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError, ForbiddenError, UnauthorizedError } from '@/lib/api/errors';

const {
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  checkPermissionV2Mock,
  requireActiveSubscriptionForMutationMock,
  requireEntitledForAdminReadMock,
  assertNotDemoGraceMock,
  listVisibleAnnouncementsMock,
  queueAnnouncementDeliveryMock,
  createNotificationsForEventMock,
  tryAutoCompleteMock,
  createAnnouncementMock,
  getAuthorNameMock,
  getByIdMock,
  getByIdIncludingDeletedMock,
  restoreMock,
  softDeleteMock,
  updateMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  checkPermissionV2Mock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  listVisibleAnnouncementsMock: vi.fn(),
  queueAnnouncementDeliveryMock: vi.fn(),
  createNotificationsForEventMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
  createAnnouncementMock: vi.fn(),
  getAuthorNameMock: vi.fn(),
  getByIdMock: vi.fn(),
  getByIdIncludingDeletedMock: vi.fn(),
  restoreMock: vi.fn(),
  softDeleteMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
  checkPermissionV2: checkPermissionV2Mock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/announcements/read-visibility', () => ({
  listVisibleAnnouncements: listVisibleAnnouncementsMock,
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: queueAnnouncementDeliveryMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: createNotificationsForEventMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

vi.mock('@/lib/services/announcement-service', () => ({
  createAnnouncementForCommunity: createAnnouncementMock,
  getAnnouncementAuthorName: getAuthorNameMock,
  getAnnouncementById: getByIdMock,
  getAnnouncementByIdIncludingDeleted: getByIdIncludingDeletedMock,
  restoreAnnouncementForCommunity: restoreMock,
  softDeleteAnnouncementForCommunity: softDeleteMock,
  updateAnnouncementForCommunity: updateMock,
}));

import { DELETE, GET, POST } from '../../src/app/api/v1/announcements/route';

const BASE = 'http://localhost:3000/api/v1/announcements';
const ACTOR = 'user-actor-1';
const OTHER = 'user-other-2';
const REQ_ID = 'req-fixed-1';
const NOW = new Date('2026-09-01T12:00:00.000Z');

const MEMBERSHIP = {
  userId: ACTOR,
  communityId: 42,
  role: 'property_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
  timezone: 'America/New_York',
};

const ROW = {
  id: 9,
  communityId: 42,
  title: 'Pool closed',
  body: '<p>Resurfacing</p>',
  audience: 'all',
  isPinned: false,
  archivedAt: null,
  expiresAt: null,
  publishedBy: ACTOR,
  publishedAt: new Date('2026-08-30T10:00:00.000Z'),
  createdAt: new Date('2026-08-30T10:00:00.000Z'),
  updatedAt: new Date('2026-08-30T10:00:00.000Z'),
  deletedAt: null,
};
const ROW_JSON =
  '{"id":9,"communityId":42,"title":"Pool closed","body":"<p>Resurfacing</p>","audience":"all",' +
  '"isPinned":false,"archivedAt":null,"expiresAt":null,"publishedBy":"user-actor-1",' +
  '"publishedAt":"2026-08-30T10:00:00.000Z","createdAt":"2026-08-30T10:00:00.000Z",' +
  '"updatedAt":"2026-08-30T10:00:00.000Z","deletedAt":null}';

const INTERNAL_500 = '{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}';
const UNAUTH_401 = '{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}';
const NOT_FOUND_COMMUNITY = '{"error":{"code":"NOT_FOUND","message":"Community not found"}}';
const NOT_FOUND_ANNOUNCEMENT = '{"error":{"code":"NOT_FOUND","message":"Announcement not found"}}';
const BAD_COMMUNITY =
  '{"error":{"code":"VALIDATION_ERROR","message":"communityId must be a positive integer"}}';

function get(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE}${query}`, { headers });
}

function send(
  method: 'POST' | 'DELETE',
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(BASE, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-request-id': REQ_ID, ...headers },
  });
}

const post = (body: unknown, headers: Record<string, string> = {}) => send('POST', body, headers);
const del = (body: unknown, headers: Record<string, string> = {}) => send('DELETE', body, headers);

function denyPermission(action: 'read' | 'write') {
  requirePermissionMock.mockImplementation((_m: unknown, resource: string, a: string) => {
    if (resource === 'announcements' && a === action) {
      throw new ForbiddenError(`You do not have ${a} permission for ${resource}`);
    }
  });
}

/** Every `logAuditEvent` call, serialised — key order and Date → ISO included. */
function auditCalls(): string[] {
  return logAuditEventMock.mock.calls.map((call) => JSON.stringify(call[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
  requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  requirePermissionMock.mockImplementation(() => {});
  checkPermissionV2Mock.mockReturnValue(true);
  requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  listVisibleAnnouncementsMock.mockResolvedValue({
    rows: [],
    totalCount: 0,
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
  queueAnnouncementDeliveryMock.mockResolvedValue(3);
  createNotificationsForEventMock.mockResolvedValue({ created: 0, skipped: 0 });
  tryAutoCompleteMock.mockResolvedValue(undefined);
  createAnnouncementMock.mockResolvedValue(ROW);
  getAuthorNameMock.mockResolvedValue('Pat Manager');
  getByIdMock.mockResolvedValue(ROW);
  getByIdIncludingDeletedMock.mockResolvedValue(null);
  restoreMock.mockResolvedValue(undefined);
  softDeleteMock.mockResolvedValue(undefined);
  updateMock.mockResolvedValue(ROW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/announcements — wire format', () => {
  it('exact { data: { data, pagination } } bytes, gate args, checklist fire', async () => {
    listVisibleAnnouncementsMock.mockResolvedValue({
      rows: [ROW],
      totalCount: 1,
      pagination: { nextCursor: 'abc', hasMore: true, pageSize: 1 },
    });

    const res = await GET(get('?communityId=42'));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"data":{"data":[${ROW_JSON}],"pagination":{"nextCursor":"abc","hasMore":true,"pageSize":1}}}`,
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'announcements', 'read');
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(42, MEMBERSHIP);
    expect(listVisibleAnnouncementsMock).toHaveBeenCalledWith(42, MEMBERSHIP, {
      includeArchived: false,
      query: '',
      cursor: undefined,
      pageSize: undefined,
    });
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, ACTOR, 'review_announcement');
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('pagination absent from the service result is absent from the wire', async () => {
    listVisibleAnnouncementsMock.mockResolvedValue({ rows: [], totalCount: 0 });
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":{"data":[]}}');
  });

  it('includeArchived / q (trimmed) / cursor / pageSize reach the visibility lookup', async () => {
    const res = await GET(
      get('?communityId=42&includeArchived=true&q=%20%20board%20&cursor=c1&pageSize=2'),
    );
    expect(res.status).toBe(200);
    expect(listVisibleAnnouncementsMock).toHaveBeenCalledWith(42, MEMBERSHIP, {
      includeArchived: true,
      query: 'board',
      cursor: 'c1',
      pageSize: 2,
    });
  });

  it('includeArchived other than exactly "true" is false; empty cursor/pageSize/q are missing', async () => {
    const res = await GET(get('?communityId=42&includeArchived=1&q=&cursor=&pageSize='));
    expect(res.status).toBe(200);
    expect(listVisibleAnnouncementsMock).toHaveBeenCalledWith(42, MEMBERSHIP, {
      includeArchived: false,
      query: '',
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('x-community-id header matching the query is accepted', async () => {
    const res = await GET(get('?communityId=42', { 'x-community-id': '42' }));
    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
  });
});

describe('GET /api/v1/announcements — auth + validation', () => {
  it('401 when unauthenticated (valid query); nothing else runs', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('403 when announcements:read is denied; nothing listed', async () => {
    denyPermission('read');
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You do not have read permission for announcements"}}',
    );
    expect(requireEntitledForAdminReadMock).not.toHaveBeenCalled();
    expect(listVisibleAnnouncementsMock).not.toHaveBeenCalled();
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });

  it('403 from the admin-read entitlement guard; nothing listed', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('Subscription lapsed', 403, 'SUBSCRIPTION_REQUIRED'),
    );
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"SUBSCRIPTION_REQUIRED","message":"Subscription lapsed"}}',
    );
    expect(listVisibleAnnouncementsMock).not.toHaveBeenCalled();
  });

  it('invalid pageSize → 400 "Invalid query parameters" with field details, after the gates', async () => {
    const res = await GET(get('?communityId=42&pageSize=abc'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid query parameters",' +
        '"details":{"fields":[{"field":"pageSize","message":"Invalid input: expected number, received NaN"}]}}}',
    );
    expect(requireEntitledForAdminReadMock).toHaveBeenCalled();
    expect(listVisibleAnnouncementsMock).not.toHaveBeenCalled();
  });

  it('cursor longer than 512 → 400 "Invalid query parameters"', async () => {
    const res = await GET(get(`?communityId=42&cursor=${'x'.repeat(513)}`));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('Invalid query parameters');
    expect(listVisibleAnnouncementsMock).not.toHaveBeenCalled();
  });

  it('junk ?communityId= (authenticated) → 400 communityId must be a positive integer', async () => {
    const res = await GET(get('?communityId=abc'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('header mismatch (authenticated) → 404 Community not found', async () => {
    const res = await GET(get('?communityId=42', { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_COMMUNITY);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('header supplies the tenant but ?communityId= is missing → legacy 400 after auth', async () => {
    const res = await GET(get('', { 'x-community-id': '42' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"communityId query parameter is required"}}',
    );
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('401 wins over a missing ?communityId= when the header supplies the tenant', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('', { 'x-community-id': '42' }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
  });

  // TENANTSCOPE DELTA (message): legacy body was
  // '{"error":{"code":"VALIDATION_ERROR","message":"communityId query parameter is required"}}',
  // after auth. The runner's resolver now refuses it first.
  it('missing ?communityId= and no header (authenticated) → 400 from the resolver, before auth', async () => {
    const res = await GET(get(''));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid or missing communityId"}}',
    );
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  // TENANTSCOPE DELTA (order): legacy returned 401 — auth ran before any
  // communityId handling.
  it('missing ?communityId= and no header, unauthenticated → 400 (resolver precedes auth)', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get(''));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid or missing communityId"}}',
    );
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  // TENANTSCOPE DELTA (order): legacy returned 401 (UNAUTH_401). Same bytes as
  // the authenticated case above — only the position relative to auth moved.
  it('junk ?communityId=, unauthenticated → the legacy 400 bytes, before auth', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=abc'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  // TENANTSCOPE DELTA (order): legacy returned 401 (UNAUTH_401).
  it('header mismatch, unauthenticated → 404 before auth', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=42', { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_COMMUNITY);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  // TENANTSCOPE DELTA (header first): legacy 400'd on the query value
  // (BAD_COMMUNITY), after auth. The resolver checks the header first.
  it('malformed header + junk ?communityId= (authenticated) → 404 on the header', async () => {
    const res = await GET(get('?communityId=abc', { 'x-community-id': 'zz' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_COMMUNITY);
  });

  it('?communityId=0 / 1.5 / -3 keep the legacy 400 bytes', async () => {
    for (const bad of ['0', '1.5', '-3']) {
      const res = await GET(get(`?communityId=${bad}`));
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(BAD_COMMUNITY);
    }
    expect(listVisibleAnnouncementsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — create (default action)
// ---------------------------------------------------------------------------

const CREATE_BODY = {
  title: 'Pool closed',
  body: '<p>Resurfacing</p><script>alert(1)</script>',
  audience: 'owners_only',
  isPinned: true,
  communityId: 42,
};

describe('POST /api/v1/announcements — create', () => {
  it('exact { data } bytes, sanitized body, audit payloads byte-for-byte, side effects', async () => {
    const res = await POST(post(CREATE_BODY));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);

    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'announcements', 'write');
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(createAnnouncementMock).toHaveBeenCalledWith(42, {
      title: 'Pool closed',
      body: '<p>Resurfacing</p>',
      audience: 'owners_only',
      isPinned: true,
      publishedBy: ACTOR,
    });

    expect(auditCalls()).toEqual([
      '{"action":"create","resourceType":"announcement","resourceId":"9",' +
        '"newValues":{"title":"Pool closed","audience":"owners_only","isPinned":true,"expiresAt":null},' +
        '"userId":"user-actor-1","communityId":42,"metadata":{"requestId":"req-fixed-1"}}',
      '{"userId":"user-actor-1","action":"announcement_email_sent","resourceType":"announcement",' +
        '"resourceId":"9","communityId":42,"metadata":{"recipientCount":3,"audience":"owners_only"}}',
    ]);

    expect(getAuthorNameMock).toHaveBeenCalledWith(42, ACTOR);
    expect(queueAnnouncementDeliveryMock).toHaveBeenCalledWith({
      communityId: 42,
      announcementId: 9,
      audience: 'owners_only',
      title: 'Pool closed',
      // Delivery gets the RAW body (legacy behaviour, preserved).
      body: '<p>Resurfacing</p><script>alert(1)</script>',
      isPinned: true,
      authorName: 'Pat Manager',
      authorUserId: ACTOR,
    });
    expect(createNotificationsForEventMock).toHaveBeenCalledWith(
      42,
      {
        category: 'announcement',
        title: 'Pool closed',
        body: 'Resurfacingalert(1)',
        actionUrl: '/announcements/9',
        sourceType: 'announcement',
        sourceId: '9',
      },
      'owners_only',
      ACTOR,
    );
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, ACTOR, 'post_announcement');
  });

  it('expiresAt is coerced to a Date and audited as ISO; defaults fill audience/isPinned', async () => {
    const res = await POST(
      post({ title: 'T', body: 'B', communityId: 42, expiresAt: '2026-10-01T00:00:00Z' }),
    );
    expect(res.status).toBe(200);
    expect(createAnnouncementMock).toHaveBeenCalledWith(42, {
      title: 'T',
      body: 'B',
      audience: 'all',
      isPinned: false,
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      publishedBy: ACTOR,
    });
    expect(auditCalls()[0]).toBe(
      '{"action":"create","resourceType":"announcement","resourceId":"9",' +
        '"newValues":{"title":"T","audience":"all","isPinned":false,"expiresAt":"2026-10-01T00:00:00.000Z"},' +
        '"userId":"user-actor-1","communityId":42,"metadata":{"requestId":"req-fixed-1"}}',
    );
  });

  it('delivery failure is swallowed: still 200, no email-sent audit row', async () => {
    queueAnnouncementDeliveryMock.mockRejectedValue(new Error('resend down'));
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);
    expect(auditCalls()).toHaveLength(1);
    expect(auditCalls()[0]).toContain('"action":"create"');
  });

  it('an unknown action falls through to create', async () => {
    const res = await POST(post({ ...CREATE_BODY, action: 'bogus' }));
    expect(res.status).toBe(200);
    expect(createAnnouncementMock).toHaveBeenCalledTimes(1);
  });

  it('a string communityId is coerced ("42") and the handler sees the number', async () => {
    const res = await POST(post({ ...CREATE_BODY, communityId: '42' }));
    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(createAnnouncementMock).toHaveBeenCalledWith(42, expect.anything());
  });

  it('invalid create data → 400 "Invalid announcement data" with field details, after the gates', async () => {
    const res = await POST(post({ body: 'no title', communityId: 42 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid announcement data",' +
        '"details":{"fields":[{"field":"title","message":"Invalid input: expected string, received undefined"}]}}}',
    );
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(createAnnouncementMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('x-request-id absent → a generated requestId is stamped', async () => {
    const req = new NextRequest(BASE, {
      method: 'POST',
      body: JSON.stringify(CREATE_BODY),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const first = logAuditEventMock.mock.calls[0]![0] as { metadata: { requestId: string } };
    expect(typeof first.metadata.requestId).toBe('string');
    expect(first.metadata.requestId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST — auth chain + body parsing (shared by every action)
// ---------------------------------------------------------------------------

describe('POST /api/v1/announcements — auth chain', () => {
  it('missing communityId → 400 before demo-grace and auth', async () => {
    const res = await POST(post({ title: 'T', body: 'B' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('negative communityId → 400 before auth', async () => {
    const res = await POST(post({ ...CREATE_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('a JSON array body is treated as {} → 400 communityId', async () => {
    const res = await POST(post('[1,2]'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
  });

  it('a JSON null body is treated as {} → 400 communityId', async () => {
    const res = await POST(post('null'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
  });

  it('malformed JSON → 500, before any gate', async () => {
    const res = await POST(post('{not json'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(INTERNAL_500);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('header mismatch → 404 before demo-grace and auth', async () => {
    const res = await POST(post(CREATE_BODY, { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_COMMUNITY);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('header supplies the tenant when it matches the body', async () => {
    const res = await POST(post(CREATE_BODY, { 'x-community-id': '42' }));
    expect(res.status).toBe(200);
  });

  // DEMO-GRACE ORDER DELTA: legacy ran assertNotDemoGrace BEFORE auth, so
  // requireAuthenticatedUserId was never called here. Same bytes for an
  // authenticated caller; it now runs after auth, still before membership.
  it('demo-grace refusal (authenticated) → same 403 bytes, after auth, before membership', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new AppError('Demo has ended', 403, 'DEMO_GRACE'),
    );
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"DEMO_GRACE","message":"Demo has ended"}}');
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createAnnouncementMock).not.toHaveBeenCalled();
  });

  // DEMO-GRACE ORDER DELTA: legacy asserted assertNotDemoGrace HAD run (42)
  // before the 401 — the unscoped pre-auth read this drain removes.
  it('401 when unauthenticated; neither demo-grace nor membership runs', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  // DEMO-GRACE ORDER DELTA: legacy answered 403 DEMO_GRACE here — an oracle
  // on the community's demo state for a caller nobody had authenticated.
  it('unauthenticated caller against a demo-grace community → 401, not 403', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    assertNotDemoGraceMock.mockRejectedValue(
      new AppError('Demo has ended', 403, 'DEMO_GRACE'),
    );
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
  });

  it('403 for a non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"FORBIDDEN","message":"Not a member"}}');
  });

  it('403 when announcements:write is denied; subscription and service never run', async () => {
    denyPermission('write');
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You do not have write permission for announcements"}}',
    );
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(createAnnouncementMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('403 from the subscription guard; service never runs', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValue(
      new AppError('Your subscription is no longer active.', 403, 'SUBSCRIPTION_REQUIRED'),
    );
    const res = await POST(post(CREATE_BODY));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"SUBSCRIPTION_REQUIRED","message":"Your subscription is no longer active."}}',
    );
    expect(createAnnouncementMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — update / pin / archive / restore
// ---------------------------------------------------------------------------

describe('POST /api/v1/announcements — update', () => {
  it('exact bytes; only supplied fields audited; body sanitized; expiresAt cleared with null', async () => {
    getByIdMock.mockResolvedValue({ ...ROW, expiresAt: new Date('2026-12-01T00:00:00.000Z') });
    const res = await POST(
      post({
        action: 'update',
        id: 9,
        communityId: 42,
        title: 'New title',
        body: '<b>x</b><img src=x onerror=alert(1)>',
        expiresAt: null,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);
    expect(getByIdMock).toHaveBeenCalledWith(42, 9);
    expect(updateMock).toHaveBeenCalledWith(42, 9, {
      title: 'New title',
      body: '<b>x</b>',
      expiresAt: null,
    });
    expect(auditCalls()).toEqual([
      '{"action":"update","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"title":"Pool closed","body":"<p>Resurfacing</p>","expiresAt":"2026-12-01T00:00:00.000Z"},' +
        '"newValues":{"title":"New title","body":"<b>x</b>","expiresAt":null},' +
        '"userId":"user-actor-1","communityId":42,"metadata":{"requestId":"req-fixed-1"}}',
    ]);
  });

  it('404 when the announcement is missing; nothing written', async () => {
    getByIdMock.mockResolvedValue(null);
    const res = await POST(post({ action: 'update', id: 9, communityId: 42, title: 'x' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_ANNOUNCEMENT);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('400 "Invalid update data" with field details', async () => {
    const res = await POST(post({ action: 'update', communityId: 42, title: 'x' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid update data",' +
        '"details":{"fields":[{"field":"id","message":"Invalid input: expected number, received undefined"}]}}}',
    );
  });

  it('an undefined service result serialises as {} (legacy bytes)', async () => {
    updateMock.mockResolvedValue(undefined);
    const res = await POST(post({ action: 'update', id: 9, communityId: 42, title: 'x' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{}');
  });
});

describe('POST /api/v1/announcements — pin', () => {
  it('exact bytes and audit payload', async () => {
    const res = await POST(post({ action: 'pin', id: 9, communityId: 42, isPinned: true }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);
    expect(updateMock).toHaveBeenCalledWith(42, 9, { isPinned: true });
    expect(auditCalls()).toEqual([
      '{"action":"update","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"isPinned":false},"newValues":{"isPinned":true},' +
        '"metadata":{"subAction":"pin","requestId":"req-fixed-1"},' +
        '"userId":"user-actor-1","communityId":42}',
    ]);
  });

  it('400 "Invalid pin action data"', async () => {
    const res = await POST(post({ action: 'pin', id: 9, communityId: 42 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Invalid pin action data' });
  });

  it('404 when missing', async () => {
    getByIdMock.mockResolvedValue(null);
    const res = await POST(post({ action: 'pin', id: 9, communityId: 42, isPinned: true }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_ANNOUNCEMENT);
  });
});

describe('POST /api/v1/announcements — archive', () => {
  it('archive stamps now; audit payload exact', async () => {
    const res = await POST(post({ action: 'archive', id: 9, communityId: 42, archive: true }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);
    expect(updateMock).toHaveBeenCalledWith(42, 9, { archivedAt: NOW });
    expect(auditCalls()).toEqual([
      '{"action":"update","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"archivedAt":null},"newValues":{"archivedAt":"2026-09-01T12:00:00.000Z"},' +
        '"metadata":{"subAction":"archive","requestId":"req-fixed-1"},' +
        '"userId":"user-actor-1","communityId":42}',
    ]);
  });

  it('unarchive clears; audit payload exact', async () => {
    getByIdMock.mockResolvedValue({ ...ROW, archivedAt: new Date('2026-08-31T00:00:00.000Z') });
    const res = await POST(post({ action: 'archive', id: 9, communityId: 42, archive: false }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(42, 9, { archivedAt: null });
    expect(auditCalls()).toEqual([
      '{"action":"update","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"archivedAt":"2026-08-31T00:00:00.000Z"},"newValues":{"archivedAt":null},' +
        '"metadata":{"subAction":"unarchive","requestId":"req-fixed-1"},' +
        '"userId":"user-actor-1","communityId":42}',
    ]);
  });

  it('400 "Invalid archive action data"', async () => {
    const res = await POST(post({ action: 'archive', id: 9, communityId: 42 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('Invalid archive action data');
  });
});

describe('POST /api/v1/announcements — restore', () => {
  const DELETED = { ...ROW, deletedAt: new Date('2026-08-31T09:00:00.000Z') };

  it('restores via the including-deleted lookup; audit payload exact', async () => {
    getByIdIncludingDeletedMock.mockResolvedValue(DELETED);
    restoreMock.mockResolvedValue(ROW);
    const res = await POST(post({ action: 'restore', id: 9, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"data":${ROW_JSON}}`);
    expect(getByIdIncludingDeletedMock).toHaveBeenCalledWith(42, 9);
    expect(restoreMock).toHaveBeenCalledWith(42, 9);
    expect(auditCalls()).toEqual([
      '{"action":"update","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"deletedAt":"2026-08-31T09:00:00.000Z"},"newValues":{"deletedAt":null},' +
        '"metadata":{"subAction":"restore","requestId":"req-fixed-1"},' +
        '"userId":"user-actor-1","communityId":42}',
    ]);
  });

  it('falls back to the existing row when the restore returns nothing', async () => {
    getByIdIncludingDeletedMock.mockResolvedValue(DELETED);
    restoreMock.mockResolvedValue(undefined);
    const res = await POST(post({ action: 'restore', id: 9, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"data":${ROW_JSON.replace('"deletedAt":null', '"deletedAt":"2026-08-31T09:00:00.000Z"')}}`,
    );
  });

  it('404 when missing even including deleted', async () => {
    const res = await POST(post({ action: 'restore', id: 9, communityId: 42 }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_ANNOUNCEMENT);
  });

  it('400 "Invalid restore action data"', async () => {
    const res = await POST(post({ action: 'restore', communityId: 42 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('Invalid restore action data');
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/announcements', () => {
  it('author self-delete: exact bytes, audit payload, membership checked twice', async () => {
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":{"id":9,"deleted":true}}');
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledTimes(2);
    expect(softDeleteMock).toHaveBeenCalledWith(42, 9);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(auditCalls()).toEqual([
      '{"action":"delete","resourceType":"announcement","resourceId":"9",' +
        '"oldValues":{"title":"Pool closed","audience":"all"},' +
        '"metadata":{"removalType":"author_self_delete","requestId":"req-fixed-1"},' +
        '"userId":"user-actor-1","communityId":42}',
    ]);
  });

  it('admin moderation of someone else\'s announcement → admin_removal', async () => {
    getByIdMock.mockResolvedValue({ ...ROW, publishedBy: OTHER });
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(checkPermissionV2Mock).toHaveBeenCalledWith(
      'property_manager',
      'condo_718',
      'announcements',
      'write',
      { isUnitOwner: false },
    );
    expect(auditCalls()[0]).toContain('"metadata":{"removalType":"admin_removal","requestId":"req-fixed-1"}');
  });

  it('403 for a non-author without moderation rights; nothing deleted', async () => {
    getByIdMock.mockResolvedValue({ ...ROW, publishedBy: OTHER });
    requireCommunityMembershipMock.mockResolvedValue({ ...MEMBERSHIP, isAdmin: false, role: 'resident' });
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You can only delete your own announcements"}}',
    );
    expect(softDeleteMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('403 for an admin whose role lacks announcements:write', async () => {
    getByIdMock.mockResolvedValue({ ...ROW, publishedBy: OTHER });
    checkPermissionV2Mock.mockReturnValue(false);
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(403);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('404 when the announcement is missing', async () => {
    getByIdMock.mockResolvedValue(null);
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_ANNOUNCEMENT);
  });

  it('400 "Invalid delete data" with field details', async () => {
    const res = await DELETE(del({ communityId: 42 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"VALIDATION_ERROR","message":"Invalid delete data",' +
        '"details":{"fields":[{"field":"id","message":"Invalid input: expected number, received undefined"}]}}}',
    );
  });

  it('bad communityId → 400 before demo-grace and auth', async () => {
    const res = await DELETE(del({ id: 9, communityId: 'x' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(BAD_COMMUNITY);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('malformed JSON → 500', async () => {
    const res = await DELETE(del('{'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(INTERNAL_500);
  });

  // DEMO-GRACE ORDER DELTA: legacy asserted assertNotDemoGrace HAD run (42)
  // before the 401.
  it('401 when unauthenticated; neither demo-grace nor membership runs', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('demo-grace refusal (authenticated) → 403 after auth, before membership', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new AppError('Demo has ended', 403, 'DEMO_GRACE'),
    );
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"DEMO_GRACE","message":"Demo has ended"}}');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('403 for a non-member; nothing looked up', async () => {
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"FORBIDDEN","message":"Not a member"}}');
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('a string communityId ("42") is coerced, as before', async () => {
    const res = await DELETE(del({ id: 9, communityId: '42' }));
    expect(res.status).toBe(200);
    expect(softDeleteMock).toHaveBeenCalledWith(42, 9);
  });

  it('403 from the subscription guard; nothing looked up', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValue(
      new AppError('Your subscription is no longer active.', 403, 'SUBSCRIPTION_REQUIRED'),
    );
    const res = await DELETE(del({ id: 9, communityId: 42 }));
    expect(res.status).toBe(403);
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('header mismatch → 404 before auth', async () => {
    const res = await DELETE(del({ id: 9, communityId: 42 }, { 'x-community-id': '7' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(NOT_FOUND_COMMUNITY);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });
});
