/**
 * `POST /api/v1/meetings` with `action: 'post-notice'`.
 *
 * `meetings.notice_posted_at` had exactly one writer in the whole repo — the
 * demo seeder — so every real community's public transparency page read "Not
 * recorded" on every row, the audit filter for `meeting_notice_posted` could
 * never match, and the "Noticed" state in the meetings UI was unreachable.
 * This action is the writer.
 *
 * It records an ATTESTATION, not an observation: §718.112(2)(c) notice is
 * posted on the property AND the website, and the platform can only witness
 * the second. So the stamp says "a manager states the notice is posted", and
 * the confirmation copy in the UI says so too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
  meetingsTableMock,
  meetingDocumentsTableMock,
  documentsTableMock,
  communitiesTableMock,
  filtersMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    title: Symbol('meetings.title'),
    meetingType: Symbol('meetings.meetingType'),
    startsAt: Symbol('meetings.startsAt'),
    endsAt: Symbol('meetings.endsAt'),
    location: Symbol('meetings.location'),
    noticePostedAt: Symbol('meetings.noticePostedAt'),
    minutesApprovedAt: Symbol('meetings.minutesApprovedAt'),
  },
  meetingDocumentsTableMock: {
    id: Symbol('meeting_documents.id'),
    meetingId: Symbol('meeting_documents.meetingId'),
    documentId: Symbol('meeting_documents.documentId'),
  },
  documentsTableMock: { id: Symbol('documents.id') },
  communitiesTableMock: {
    id: Symbol('communities.id'),
    timezone: Symbol('communities.timezone'),
  },
  filtersMock: {
    and: vi.fn((...parts: unknown[]) => ({ type: 'and', parts })),
    asc: vi.fn((value: unknown) => ({ type: 'asc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    gte: vi.fn((left: unknown, right: unknown) => ({ type: 'gte', left, right })),
    lt: vi.fn((left: unknown, right: unknown) => ({ type: 'lt', left, right })),
  },
}));

function makeSelectResult<T>(rows: T[]) {
  return Object.assign(Promise.resolve(rows), {
    orderBy: vi.fn().mockResolvedValue(rows),
  });
}

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  meetings: meetingsTableMock,
  meetingDocuments: meetingDocumentsTableMock,
  documents: documentsTableMock,
  communities: communitiesTableMock,
}));

vi.mock('@propertypro/db/filters', () => filtersMock);

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationsForEvent: vi.fn().mockResolvedValue({ created: 0, skipped: 0 }),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../../src/app/api/v1/meetings/route';

const MEETING_ROW = {
  id: 7,
  title: 'September Board Meeting',
  meetingType: 'board',
  startsAt: new Date('2026-09-17T22:30:00.000Z'),
  endsAt: null,
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
};

/**
 * The route reads the meeting twice: once inside `markMeetingNoticePosted`
 * (to 404 and to see whether a stamp already exists) and once afterwards to
 * serialize the response. `afterUpdate` is what the second read returns.
 */
function mockMeeting(row: Record<string, unknown> | null, afterUpdate?: Record<string, unknown>) {
  const updateMock = vi.fn().mockResolvedValue(undefined);
  let reads = 0;
  const selectFromMock = vi.fn((table: unknown) => {
    if (table !== meetingsTableMock) return makeSelectResult([]);
    reads += 1;
    if (row === null) return makeSelectResult([]);
    return makeSelectResult([reads === 1 ? row : (afterUpdate ?? row)]);
  });
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    insert: vi.fn(),
    update: updateMock,
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  });
  return { updateMock, selectFromMock };
}

function postNotice(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-community-id': '42' },
      body: JSON.stringify({ action: 'post-notice', communityId: 42, ...body }),
    }),
  );
}

describe('meetings route — post-notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-14T18:05:00.000Z') });
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Board President',
      permissions: {
        resources: {
          meetings: { read: true, write: true },
          documents: { read: true, write: true },
        },
      },
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
  });

  it('stamps the meeting with now and returns the updated meeting', async () => {
    const stampedAt = new Date('2026-09-14T18:05:00.000Z');
    const { updateMock } = mockMeeting(MEETING_ROW, {
      ...MEETING_ROW,
      noticePostedAt: stampedAt,
    });

    const response = await postNotice({ id: 7 });
    const json = (await response.json()) as { data: { id: number; noticePostedAt: string | null } };

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      meetingsTableMock,
      { noticePostedAt: stampedAt },
      expect.anything(),
    );
    expect(json.data.noticePostedAt).toBe('2026-09-14T18:05:00.000Z');
  });

  it('logs the meeting_notice_posted audit action that nothing has ever emitted', async () => {
    mockMeeting(MEETING_ROW, {
      ...MEETING_ROW,
      noticePostedAt: new Date('2026-09-14T18:05:00.000Z'),
    });

    await postNotice({ id: 7 });

    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'session-user-1',
      action: 'meeting_notice_posted',
      resourceType: 'meeting',
      resourceId: '7',
      communityId: 42,
      newValues: { noticePostedAt: '2026-09-14T18:05:00.000Z' },
    });
  });

  it('is idempotent: an already-posted notice keeps its original stamp and logs nothing', async () => {
    const original = new Date('2026-09-10T14:00:00.000Z');
    const { updateMock } = mockMeeting({ ...MEETING_ROW, noticePostedAt: original });

    const response = await postNotice({ id: 7 });
    const json = (await response.json()) as { data: { noticePostedAt: string | null } };

    expect(response.status).toBe(200);
    expect(json.data.noticePostedAt).toBe('2026-09-10T14:00:00.000Z');
    // Re-stamping would move the date a board may already have relied on, and
    // a second audit row would claim a second posting that never happened.
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('404s when the meeting is not in this community, without writing anything', async () => {
    const { updateMock } = mockMeeting(null);

    const response = await postNotice({ id: 7 });

    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('422s on a missing meeting id rather than falling through to create', async () => {
    const { updateMock } = mockMeeting(MEETING_ROW);

    const response = await postNotice({});

    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('403s a caller without meetings:write', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      displayTitle: 'Owner',
      permissions: { resources: { meetings: { read: true, write: false } } },
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
    const { updateMock } = mockMeeting(MEETING_ROW);

    const response = await postNotice({ id: 7 });

    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('records a late posting honestly rather than refusing it', async () => {
    // The meeting is tomorrow and its 48-hour deadline has passed. The board
    // still posted; the public page computes the lead time and will show the
    // requirement as missed. Refusing the write would lose the record.
    const stampedAt = new Date('2026-09-14T18:05:00.000Z');
    const imminent = {
      ...MEETING_ROW,
      startsAt: new Date('2026-09-15T22:30:00.000Z'),
    };
    const { updateMock } = mockMeeting(imminent, { ...imminent, noticePostedAt: stampedAt });

    const response = await postNotice({ id: 7 });
    const json = (await response.json()) as {
      data: { noticePostedAt: string | null };
      warnings?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(json.data.noticePostedAt).toBe('2026-09-14T18:05:00.000Z');
    // No notice-window warning on this action: it tells the reader to
    // reschedule, which is stale advice the instant the notice is posted.
    expect(json.warnings).toBeUndefined();
  });
});
