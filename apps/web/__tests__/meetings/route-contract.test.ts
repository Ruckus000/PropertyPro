/**
 * Wire-format + auth-gate pins for `/api/v1/meetings` (GET + POST).
 *
 * CON-05 (Phase 3.5): this route moved from a hand-rolled `withErrorHandler`
 * handler onto `runRoute(contract, handler)`. These tests were written and run
 * green (52/52) against the PRE-migration route first, so every exact-bytes
 * assertion below is the pre-migration wire format. The only cases edited (4)
 * or added (1) after the drain are the GET error-path deltas that declaring
 * `tenantScope: { in: 'query' }` introduces, each marked `TENANTSCOPE DELTA`
 * with the legacy behaviour it replaced (see `contract.ts`). Pinned:
 *
 *   - success envelopes, key order included: GET `{ data: [...] }`, POST
 *     `{ data }` plus the top-level `warnings` sibling ONLY when non-empty
 *     (create / update), and never on post-notice
 *   - error envelopes (401 / 400 / 403 / 404 / 422 / 500), including the 422
 *     `UNPROCESSABLE_ENTITY` + `details.fields` shape per action, and
 *     `BAD_REQUEST` (not `VALIDATION_ERROR`) for a bad `communityId`
 *   - gate ORDER (auth before GET query validation; POST body communityId
 *     parse before auth, demo-grace before membership)
 *   - audit-log payloads, byte-for-byte
 *
 * Only services and gates are mocked. The runner, `resolveEffectiveCommunityId`,
 * `serializeMeetingResponse`, `buildMeetingNoticeWarning`, `formatZodErrors`
 * and the calendar date-range parser all run for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';

const {
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  requireBoardDesignationMock,
  requireActiveSubscriptionForMutationMock,
  requireEntitledForAdminReadMock,
  assertNotDemoGraceMock,
  queueNotificationMock,
  createNotificationsForEventMock,
  listMeetingsMock,
  getMeetingDetailMock,
  createMeetingMock,
  getTimezoneMock,
  updateMeetingMock,
  markNoticePostedMock,
  softDeleteMock,
  getTargetsMock,
  attachMock,
  detachMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireBoardDesignationMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  queueNotificationMock: vi.fn(),
  createNotificationsForEventMock: vi.fn(),
  listMeetingsMock: vi.fn(),
  getMeetingDetailMock: vi.fn(),
  createMeetingMock: vi.fn(),
  getTimezoneMock: vi.fn(),
  updateMeetingMock: vi.fn(),
  markNoticePostedMock: vi.fn(),
  softDeleteMock: vi.fn(),
  getTargetsMock: vi.fn(),
  attachMock: vi.fn(),
  detachMock: vi.fn(),
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
  requireBoardDesignation: requireBoardDesignationMock,
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

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: queueNotificationMock,
  createNotificationsForEvent: createNotificationsForEventMock,
}));

vi.mock('@/lib/services/meeting-service', () => ({
  listMeetingsForCommunity: listMeetingsMock,
  getMeetingDetail: getMeetingDetailMock,
  createMeetingForCommunity: createMeetingMock,
  getMeetingCommunityTimezone: getTimezoneMock,
  updateMeetingForCommunity: updateMeetingMock,
  markMeetingNoticePosted: markNoticePostedMock,
  softDeleteMeetingForCommunity: softDeleteMock,
  getMeetingDocumentTargets: getTargetsMock,
  attachMeetingDocument: attachMock,
  detachMeetingDocument: detachMock,
}));

import { GET, POST } from '../../src/app/api/v1/meetings/route';

const BASE = 'http://localhost:3000/api/v1/meetings';
const ACTOR = 'user-actor-1';
const NOW = new Date('2026-09-01T12:00:00.000Z');

const MEMBERSHIP = {
  userId: ACTOR,
  communityId: 42,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
  timezone: 'America/New_York',
};

/** Far enough out that no notice window has closed at NOW. */
const COMPLIANT = {
  id: 7,
  title: 'sunset-condos Annual Owners Meeting',
  meetingType: 'annual',
  startsAt: new Date('2026-12-01T23:00:00.000Z'),
  endsAt: new Date('2026-12-02T01:00:00.000Z'),
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
};
const COMPLIANT_JSON = {
  id: 7,
  title: 'Annual Owners Meeting',
  meetingType: 'annual',
  startsAt: '2026-12-01T23:00:00.000Z',
  endsAt: '2026-12-02T01:00:00.000Z',
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-11-17T23:00:00.000Z',
    ownerVoteDocsBy: '2026-11-24T23:00:00.000Z',
    minutesPostBy: '2026-12-31T23:00:00.000Z',
  },
};

/** An owner meeting four days out: its 14-day notice deadline has passed. */
const LATE = {
  id: 8,
  title: 'Budget Meeting',
  meetingType: 'budget',
  startsAt: new Date('2026-09-05T22:00:00.000Z'),
  endsAt: null,
  location: 'Pool deck',
  noticePostedAt: null,
  minutesApprovedAt: null,
};
const LATE_JSON = {
  id: 8,
  title: 'Budget Meeting',
  meetingType: 'budget',
  startsAt: '2026-09-05T22:00:00.000Z',
  endsAt: null,
  location: 'Pool deck',
  noticePostedAt: null,
  minutesApprovedAt: null,
  deadlines: {
    noticePostBy: '2026-08-22T22:00:00.000Z',
    ownerVoteDocsBy: '2026-08-29T22:00:00.000Z',
    minutesPostBy: '2026-10-05T22:00:00.000Z',
  },
};
const LATE_WARNING =
  '{"code":"notice_window_missed","message":"This meeting is inside its 14-day notice window — ' +
  'the deadline to post notice passed 10 days ago. Florida law grants no extension for short notice, ' +
  'so an action taken at this meeting can be challenged. Reschedule with a compliant notice unless ' +
  'this is an emergency."}';

const INTERNAL_500 = '{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}';
const UNAUTH_401 = '{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}';

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

function denyPermission(action: 'read' | 'write') {
  requirePermissionMock.mockImplementation((_m: unknown, resource: string, a: string) => {
    if (resource === 'meetings' && a === action) {
      throw new ForbiddenError(`You do not have ${a} permission for ${resource}`);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
  requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  requirePermissionMock.mockImplementation(() => {});
  requireBoardDesignationMock.mockImplementation(() => {});
  requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  queueNotificationMock.mockResolvedValue(undefined);
  createNotificationsForEventMock.mockResolvedValue({ created: 0, skipped: 0 });
  listMeetingsMock.mockResolvedValue([]);
  getMeetingDetailMock.mockResolvedValue(null);
  createMeetingMock.mockResolvedValue(null);
  getTimezoneMock.mockResolvedValue('America/New_York');
  updateMeetingMock.mockResolvedValue(undefined);
  markNoticePostedMock.mockResolvedValue({ found: false, alreadyStamped: false, stampedAt: null });
  softDeleteMock.mockResolvedValue(undefined);
  getTargetsMock.mockResolvedValue({ meetingFound: true, documentFound: true });
  attachMock.mockResolvedValue(null);
  detachMock.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/meetings — wire format', () => {
  it('exact { data: [...] } bytes (no warnings, even for a late meeting) and gate args', async () => {
    listMeetingsMock.mockResolvedValue([COMPLIANT, LATE]);

    const res = await GET(get('?communityId=42'));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: [COMPLIANT_JSON, LATE_JSON] }));
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'meetings', 'read');
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(42, MEMBERSHIP);
    expect(listMeetingsMock).toHaveBeenCalledWith(42, undefined);
  });

  it('empty list is {"data":[]}', async () => {
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":[]}');
  });

  it('start/end become a membership-timezone UTC range for the service', async () => {
    const res = await GET(get('?communityId=42&start=2026-10-01&end=2026-10-31'));
    expect(res.status).toBe(200);
    expect(listMeetingsMock).toHaveBeenCalledWith(42, {
      start: '2026-10-01',
      end: '2026-10-31',
      startUtc: new Date('2026-10-01T04:00:00.000Z'),
      endUtcExclusive: new Date('2026-11-01T04:00:00.000Z'),
    });
  });

  it('start without end → 400 BAD_REQUEST after auth', async () => {
    const res = await GET(get('?communityId=42&start=2026-10-01'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"BAD_REQUEST","message":"start and end must be provided together"}}',
    );
    expect(listMeetingsMock).not.toHaveBeenCalled();
  });

  it('invalid calendar date → 400 BAD_REQUEST with the first zod message', async () => {
    const res = await GET(get('?communityId=42&start=2026-02-30&end=2026-03-01'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"BAD_REQUEST","message":"Must be a valid calendar date"}}',
    );
  });

  it('x-community-id header matching the query is accepted', async () => {
    const res = await GET(get('?communityId=42', { 'x-community-id': '42' }));
    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
  });
});

describe('GET /api/v1/meetings — auth + validation', () => {
  it('401 when unauthenticated (valid query)', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('401 wins over a missing ?communityId= when the header supplies the tenant', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('', { 'x-community-id': '42' }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
  });

  it('403 when meetings:read is denied; nothing listed', async () => {
    denyPermission('read');
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You do not have read permission for meetings"}}',
    );
    expect(requireEntitledForAdminReadMock).not.toHaveBeenCalled();
    expect(listMeetingsMock).not.toHaveBeenCalled();
  });

  it('403 from the lapsed-entitlement read guard', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(new ForbiddenError('Subscription lapsed'));
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"FORBIDDEN","message":"Subscription lapsed"}}');
    expect(listMeetingsMock).not.toHaveBeenCalled();
  });

  it('missing ?communityId= with the header → 400 BAD_REQUEST legacy message, after auth', async () => {
    const res = await GET(get('', { 'x-community-id': '42' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"BAD_REQUEST","message":"communityId query parameter is required"}}',
    );
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('non-integer ?communityId= with the header → 400 BAD_REQUEST legacy message, after auth', async () => {
    const res = await GET(get('?communityId=abc', { 'x-community-id': '42' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"BAD_REQUEST","message":"communityId must be a positive integer"}}',
    );
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('?communityId= disagreeing with x-community-id → 404, no membership read', async () => {
    const res = await GET(get('?communityId=43', { 'x-community-id': '42' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Community not found"}}');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('malformed x-community-id → 404, no membership read', async () => {
    const res = await GET(get('?communityId=42', { 'x-community-id': 'nope' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Community not found"}}');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('500 envelope when the service throws', async () => {
    listMeetingsMock.mockRejectedValue(new Error('db down'));
    const res = await GET(get('?communityId=42'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(INTERNAL_500);
  });
});

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

describe('POST /api/v1/meetings — create', () => {
  const compliantBody = {
    communityId: 42,
    title: 'sunset-condos Annual Owners Meeting',
    meetingType: 'annual',
    startsAt: '2026-12-01T23:00:00.000Z',
    endsAt: '2026-12-02T01:00:00.000Z',
    location: 'Clubhouse',
  };

  it('compliant schedule: exact {"data":…} bytes with NO warnings key, service + audit + notification args', async () => {
    createMeetingMock.mockResolvedValue(7);
    getMeetingDetailMock.mockResolvedValue(COMPLIANT);

    const res = await POST(post(compliantBody));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: COMPLIANT_JSON }));
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, ACTOR);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'meetings', 'write');
    expect(requireBoardDesignationMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(createMeetingMock).toHaveBeenCalledWith(42, {
      title: 'sunset-condos Annual Owners Meeting',
      meetingType: 'annual',
      startsAt: new Date('2026-12-01T23:00:00.000Z'),
      endsAt: new Date('2026-12-02T01:00:00.000Z'),
      location: 'Clubhouse',
    });
    expect(getMeetingDetailMock).toHaveBeenCalledWith(42, 7);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"create","resourceType":"meeting","resourceId":"7",' +
        '"communityId":42,"newValues":{"title":"sunset-condos Annual Owners Meeting","meetingType":"annual",' +
        '"startsAt":"2026-12-01T23:00:00.000Z","endsAt":"2026-12-02T01:00:00.000Z","location":"Clubhouse"}}',
    );
    expect(queueNotificationMock).toHaveBeenCalledWith(
      42,
      {
        type: 'meeting_notice',
        meetingTitle: 'sunset-condos Annual Owners Meeting',
        meetingDate: 'December 1, 2026',
        meetingTime: '6:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'owner',
        sourceType: 'meeting',
        sourceId: '7',
      },
      'all',
      ACTOR,
    );
    expect(createNotificationsForEventMock).toHaveBeenCalledWith(
      42,
      {
        category: 'meeting',
        title: 'New Meeting: sunset-condos Annual Owners Meeting',
        body: 'December 1, 2026 · Clubhouse',
        actionUrl: '/meetings/7',
        sourceType: 'meeting',
        sourceId: '7',
      },
      'all',
      ACTOR,
    );
  });

  it('inside the notice window: exact {"data":…,"warnings":[…]} bytes', async () => {
    createMeetingMock.mockResolvedValue(8);
    getMeetingDetailMock.mockResolvedValue(LATE);

    const res = await POST(
      post({
        communityId: 42,
        title: 'Budget Meeting',
        meetingType: 'budget',
        startsAt: '2026-09-05T22:00:00.000Z',
        location: 'Pool deck',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"data":${JSON.stringify(LATE_JSON)},"warnings":[${LATE_WARNING}]}`,
    );
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"create","resourceType":"meeting","resourceId":"8",' +
        '"communityId":42,"newValues":{"title":"Budget Meeting","meetingType":"budget",' +
        '"startsAt":"2026-09-05T22:00:00.000Z","endsAt":null,"location":"Pool deck"}}',
    );
  });

  it('a string body communityId is accepted (coerced by Number())', async () => {
    createMeetingMock.mockResolvedValue(7);
    getMeetingDetailMock.mockResolvedValue(COMPLIANT);
    const res = await POST(post({ ...compliantBody, communityId: '42' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: COMPLIANT_JSON }));
    expect(createMeetingMock).toHaveBeenCalledWith(42, expect.any(Object));
  });

  it('notification dispatch failure does not fail the create', async () => {
    createMeetingMock.mockResolvedValue(7);
    getMeetingDetailMock.mockResolvedValue(COMPLIANT);
    queueNotificationMock.mockRejectedValue(new Error('resend down'));
    const res = await POST(post(compliantBody));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: COMPLIANT_JSON }));
  });

  it('422 UNPROCESSABLE_ENTITY with per-field details on an invalid create', async () => {
    const res = await POST(post({ communityId: 42, title: '', meetingType: 'party' }));
    expect(res.status).toBe(422);
    expect(await res.text()).toBe(
      '{"error":{"code":"UNPROCESSABLE_ENTITY","message":"Invalid meeting data","details":{"fields":[' +
        '{"field":"title","message":"Too small: expected string to have >=1 characters"},' +
        '{"field":"meetingType","message":"Invalid option: expected one of \\"board\\"|\\"annual\\"|\\"special\\"|\\"budget\\"|\\"committee\\""},' +
        '{"field":"startsAt","message":"Invalid input: expected string, received undefined"},' +
        '{"field":"location","message":"Invalid input: expected string, received undefined"}]}}}',
    );
    expect(createMeetingMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('422 when endsAt is not after startsAt', async () => {
    const res = await POST(post({ ...compliantBody, endsAt: '2026-12-01T22:00:00.000Z' }));
    expect(res.status).toBe(422);
    expect(await res.text()).toBe(
      '{"error":{"code":"UNPROCESSABLE_ENTITY","message":"Invalid meeting data","details":{"fields":[' +
        '{"field":"endsAt","message":"End time must be after start time"}]}}}',
    );
  });

  it('an unknown action falls through to create (422 "Invalid meeting data")', async () => {
    const res = await POST(post({ action: 'frobnicate', communityId: 42 }));
    expect(res.status).toBe(422);
    expect(JSON.parse(await res.text()).error.message).toBe('Invalid meeting data');
  });

  it('500 when the created row cannot be reloaded', async () => {
    createMeetingMock.mockResolvedValue(7);
    getMeetingDetailMock.mockResolvedValue(null);
    const res = await POST(post(compliantBody));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(INTERNAL_500);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — gates and communityId resolution
// ---------------------------------------------------------------------------

describe('POST /api/v1/meetings — gates', () => {
  const body = {
    communityId: 42,
    title: 'Board Meeting',
    meetingType: 'board',
    startsAt: '2026-12-01T23:00:00.000Z',
    location: 'Clubhouse',
  };

  it('401 when unauthenticated; no demo-grace read', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(post(body));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(UNAUTH_401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
  });

  it('missing body communityId → 400 BAD_REQUEST before auth', async () => {
    const res = await POST(post({ ...body, communityId: undefined }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      '{"error":{"code":"BAD_REQUEST","message":"communityId must be a positive integer"}}',
    );
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('body communityId disagreeing with x-community-id → 404 before auth', async () => {
    const res = await POST(post({ ...body, communityId: 43 }, { 'x-community-id': '42' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Community not found"}}');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('malformed JSON → 500 INTERNAL_ERROR, nothing else runs', async () => {
    const res = await POST(post('{not json'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(INTERNAL_500);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('demo-grace 403 fires before membership', async () => {
    assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo expired'));
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"FORBIDDEN","message":"Demo expired"}}');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('403 when meetings:write is denied; no board gate, no write', async () => {
    denyPermission('write');
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"You do not have write permission for meetings"}}',
    );
    expect(requireBoardDesignationMock).not.toHaveBeenCalled();
    expect(createMeetingMock).not.toHaveBeenCalled();
  });

  it('meetingType board runs the board-designation gate (403 passes through)', async () => {
    requireBoardDesignationMock.mockImplementation(() => {
      throw new ForbiddenError('Board designation required');
    });
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(
      '{"error":{"code":"FORBIDDEN","message":"Board designation required"}}',
    );
    expect(requireBoardDesignationMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
  });

  it('subscription guard refusal blocks the mutation', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValue(new ForbiddenError('Subscription required'));
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":{"code":"FORBIDDEN","message":"Subscription required"}}');
    expect(createMeetingMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — update / post-notice / delete / attach / detach
// ---------------------------------------------------------------------------

describe('POST /api/v1/meetings — update', () => {
  it('reschedule into the window: exact bytes with warnings, update + audit diff', async () => {
    getMeetingDetailMock
      .mockResolvedValueOnce({ ...LATE, startsAt: new Date('2026-12-05T22:00:00.000Z') })
      .mockResolvedValueOnce(LATE);

    const res = await POST(
      post({ action: 'update', id: 8, communityId: 42, startsAt: '2026-09-05T22:00:00.000Z' }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"data":${JSON.stringify(LATE_JSON)},"warnings":[${LATE_WARNING}]}`,
    );
    expect(updateMeetingMock).toHaveBeenCalledWith(42, 8, {
      startsAt: new Date('2026-09-05T22:00:00.000Z'),
    });
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"update","resourceType":"meeting","resourceId":"8",' +
        '"communityId":42,"oldValues":{"startsAt":"2026-12-05T22:00:00.000Z"},' +
        '"newValues":{"startsAt":"2026-09-05T22:00:00.000Z"}}',
    );
  });

  it('compliant update: no warnings key; empty diff skips the write but still audits', async () => {
    getMeetingDetailMock.mockResolvedValue(COMPLIANT);
    const res = await POST(post({ action: 'update', id: 7, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ data: COMPLIANT_JSON }));
    expect(updateMeetingMock).not.toHaveBeenCalled();
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"update","resourceType":"meeting","resourceId":"7",' +
        '"communityId":42,"oldValues":{},"newValues":{}}',
    );
  });

  it('404 when the meeting is not in this community', async () => {
    const res = await POST(post({ action: 'update', id: 99, communityId: 42, title: 'x' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Meeting not found"}}');
  });

  it('422 "Invalid update data" on a missing id', async () => {
    const res = await POST(post({ action: 'update', communityId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.text()).toBe(
      '{"error":{"code":"UNPROCESSABLE_ENTITY","message":"Invalid update data","details":{"fields":[' +
        '{"field":"id","message":"Invalid input: expected number, received undefined"}]}}}',
    );
  });

  it('422 when only endsAt moves before the existing start (fields as a record)', async () => {
    getMeetingDetailMock.mockResolvedValue(COMPLIANT);
    const res = await POST(
      post({ action: 'update', id: 7, communityId: 42, endsAt: '2026-12-01T22:00:00.000Z' }),
    );
    expect(res.status).toBe(422);
    expect(await res.text()).toBe(
      '{"error":{"code":"UNPROCESSABLE_ENTITY","message":"Invalid meeting data","details":{"fields":' +
        '{"endsAt":["End time must be after start time"]}}}}',
    );
    expect(updateMeetingMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/meetings — post-notice', () => {
  it('never carries warnings, even for a late meeting; audits the stamp', async () => {
    const stampedAt = new Date('2026-09-01T12:00:00.000Z');
    markNoticePostedMock.mockResolvedValue({ found: true, alreadyStamped: false, stampedAt });
    getMeetingDetailMock.mockResolvedValue({ ...LATE, noticePostedAt: stampedAt });

    const res = await POST(post({ action: 'post-notice', id: 8, communityId: 42 }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      JSON.stringify({ data: { ...LATE_JSON, noticePostedAt: '2026-09-01T12:00:00.000Z' } }),
    );
    expect(markNoticePostedMock).toHaveBeenCalledWith(42, 8, NOW);
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"meeting_notice_posted","resourceType":"meeting",' +
        '"resourceId":"8","communityId":42,"newValues":{"noticePostedAt":"2026-09-01T12:00:00.000Z"}}',
    );
  });

  it('422 "Invalid notice data" on a missing id', async () => {
    const res = await POST(post({ action: 'post-notice', communityId: 42 }));
    expect(res.status).toBe(422);
    expect(JSON.parse(await res.text()).error).toEqual({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Invalid notice data',
      details: { fields: [{ field: 'id', message: 'Invalid input: expected number, received undefined' }] },
    });
  });

  it('404 when the meeting is not found', async () => {
    const res = await POST(post({ action: 'post-notice', id: 8, communityId: 42 }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Meeting not found"}}');
  });
});

describe('POST /api/v1/meetings — delete / attach / detach', () => {
  it('delete: {"data":{"success":true}} and audit', async () => {
    const res = await POST(post({ action: 'delete', id: 7, communityId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":{"success":true}}');
    expect(softDeleteMock).toHaveBeenCalledWith(42, 7);
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"delete","resourceType":"meeting","resourceId":"7","communityId":42}',
    );
  });

  it('delete: 422 "Invalid delete data"', async () => {
    const res = await POST(post({ action: 'delete', id: 0, communityId: 42 }));
    expect(res.status).toBe(422);
    expect(JSON.parse(await res.text()).error.message).toBe('Invalid delete data');
  });

  it('attach: {"data":<row>} with Date → ISO, and audit', async () => {
    attachMock.mockResolvedValue({
      id: 5,
      meetingId: 7,
      documentId: 11,
      attachedBy: ACTOR,
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
    });
    const res = await POST(post({ action: 'attach', communityId: 42, meetingId: 7, documentId: 11 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"id":5,"meetingId":7,"documentId":11,"attachedBy":"user-actor-1","createdAt":"2026-09-01T12:00:00.000Z"}}',
    );
    expect(attachMock).toHaveBeenCalledWith(42, 7, 11, ACTOR);
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"update","resourceType":"meeting_document","resourceId":"5",' +
        '"communityId":42,"newValues":{"meetingId":7,"documentId":11},"metadata":{"subAction":"attach"}}',
    );
  });

  it('attach: a null insert result is {"data":null} and audits resourceId ""', async () => {
    const res = await POST(post({ action: 'attach', communityId: 42, meetingId: 7, documentId: 11 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":null}');
    expect(logAuditEventMock.mock.calls[0]![0].resourceId).toBe('');
  });

  it('attach: 404 document not found, nothing written', async () => {
    getTargetsMock.mockResolvedValue({ meetingFound: true, documentFound: false });
    const res = await POST(post({ action: 'attach', communityId: 42, meetingId: 7, documentId: 11 }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Document not found"}}');
    expect(attachMock).not.toHaveBeenCalled();
  });

  it('attach: 422 "Invalid attachment data"', async () => {
    const res = await POST(post({ action: 'attach', communityId: 42, meetingId: 7 }));
    expect(res.status).toBe(422);
    expect(JSON.parse(await res.text()).error.message).toBe('Invalid attachment data');
  });

  it('detach: {"data":{"success":true}} and audit', async () => {
    const res = await POST(post({ action: 'detach', communityId: 42, meetingId: 7, documentId: 11 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":{"success":true}}');
    expect(detachMock).toHaveBeenCalledWith(42, 7, 11);
    expect(JSON.stringify(logAuditEventMock.mock.calls[0]![0])).toBe(
      '{"userId":"user-actor-1","action":"update","resourceType":"meeting_document","resourceId":"7:11",' +
        '"communityId":42,"metadata":{"subAction":"detach"}}',
    );
  });

  it('detach: 404 meeting not found', async () => {
    getTargetsMock.mockResolvedValue({ meetingFound: false, documentFound: true });
    const res = await POST(post({ action: 'detach', communityId: 42, meetingId: 7, documentId: 11 }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":{"code":"NOT_FOUND","message":"Meeting not found"}}');
  });

  it('detach: 422 "Invalid detach data"', async () => {
    const res = await POST(post({ action: 'detach', communityId: 42, documentId: 11 }));
    expect(res.status).toBe(422);
    expect(JSON.parse(await res.text()).error.message).toBe('Invalid detach data');
  });
});

// ---------------------------------------------------------------------------
// GET error paths that depend on where tenant resolution runs
// ---------------------------------------------------------------------------
//
// Each case here was first written against the legacy handler; the legacy
// expectation is quoted in its comment. Declaring `tenantScope: { in: 'query' }`
// moves tenant resolution into the runner, ahead of the handler's
// `requireAuthenticatedUserId`. These are the only wire changes the drain
// makes (see contract.ts, "GET error-path deltas").

const RESOLVER_400 =
  '{"error":{"code":"VALIDATION_ERROR","message":"Invalid or missing communityId"}}';
const COMMUNITY_404 = '{"error":{"code":"NOT_FOUND","message":"Community not found"}}';

describe('GET /api/v1/meetings — TENANTSCOPE DELTA (pre-auth tenant resolution)', () => {
  it('TENANTSCOPE DELTA 1: missing ?communityId= and no header → resolver 400, before auth', async () => {
    // Legacy: 400 BAD_REQUEST 'communityId query parameter is required', after auth.
    const res = await GET(get(''));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(RESOLVER_400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('TENANTSCOPE DELTA 1: non-integer ?communityId= and no header → resolver 400, before auth', async () => {
    // Legacy: 400 BAD_REQUEST 'communityId must be a positive integer', after auth.
    const res = await GET(get('?communityId=1.5'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(RESOLVER_400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('TENANTSCOPE DELTA 1: unauthenticated + missing ?communityId= and no header → 400, not 401', async () => {
    // Legacy: 401 UNAUTHORIZED.
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get(''));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(RESOLVER_400);
  });

  it('TENANTSCOPE DELTA 2: unauthenticated + ?communityId= disagreeing with the header → 404, not 401', async () => {
    // Legacy: 401 UNAUTHORIZED.
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(get('?communityId=43', { 'x-community-id': '42' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(COMMUNITY_404);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('TENANTSCOPE DELTA 3: malformed x-community-id + missing ?communityId= → 404, before auth', async () => {
    // Legacy: 400 BAD_REQUEST 'communityId query parameter is required', after auth.
    const res = await GET(get('', { 'x-community-id': 'nope' }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(COMMUNITY_404);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });
});
