/**
 * `POST /api/v1/meetings` with `action: 'record-minutes'` (audit 2026-11-05,
 * H-5).
 *
 * The minutes checklist row is now scored per board meeting, from the
 * meeting's posting stamp and the document named as its minutes. Before this
 * action only minutes AUTHORED in the app could stamp a meeting, so a board that
 * uploads its minutes as a PDF would read "minutes not posted" forever.
 *
 * Runs the real meeting service against a mocked scoped client, so the
 * service's refusals (not held, another document already, cross-community) are
 * exercised, not stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  setDocumentReceivedAtMock,
  requireCommunityMembershipMock,
  meetingsTableMock,
  meetingDocumentsTableMock,
  documentsTableMock,
  filtersMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  setDocumentReceivedAtMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    title: Symbol('meetings.title'),
    meetingType: Symbol('meetings.meetingType'),
    startsAt: Symbol('meetings.startsAt'),
    endsAt: Symbol('meetings.endsAt'),
    location: Symbol('meetings.location'),
    noticePostedAt: Symbol('meetings.noticePostedAt'),
    minutesApprovedAt: Symbol('meetings.minutesApprovedAt'),
    minutesDocumentId: Symbol('meetings.minutesDocumentId'),
  },
  meetingDocumentsTableMock: {
    id: Symbol('meeting_documents.id'),
    meetingId: Symbol('meeting_documents.meetingId'),
    documentId: Symbol('meeting_documents.documentId'),
  },
  documentsTableMock: { id: Symbol('documents.id'), postedAt: Symbol('documents.postedAt') },
  filtersMock: {
    and: vi.fn((...parts: unknown[]) => ({ type: 'and', parts })),
    asc: vi.fn((value: unknown) => ({ type: 'asc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    gte: vi.fn((left: unknown, right: unknown) => ({ type: 'gte', left, right })),
    lt: vi.fn((left: unknown, right: unknown) => ({ type: 'lt', left, right })),
    inArray: vi.fn((left: unknown, right: unknown) => ({ type: 'inArray', left, right })),
    isNull: vi.fn((value: unknown) => ({ type: 'isNull', value })),
    isNotNull: vi.fn((value: unknown) => ({ type: 'isNotNull', value })),
  },
}));

function rows<T>(list: T[]) {
  return Object.assign(Promise.resolve(list), { orderBy: vi.fn().mockResolvedValue(list) });
}

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  meetings: meetingsTableMock,
  meetingDocuments: meetingDocumentsTableMock,
  documents: documentsTableMock,
  communities: { id: Symbol('communities.id') },
}));
vi.mock('@propertypro/db/filters', () => filtersMock);
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn(),
  createNotificationsForEvent: vi.fn(),
}));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/document-received-at-service', () => ({
  RECEIVED_DATE_KEPT_WARNING: { code: 'received_date_kept', message: 'kept' },
  setDocumentReceivedAt: setDocumentReceivedAtMock,
}));

import { POST } from '../../src/app/api/v1/meetings/route';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const POSTED_AT = new Date('2026-11-10T12:00:00.000Z');

const HELD_MEETING = {
  id: 7,
  title: 'October Board Meeting',
  meetingType: 'board',
  startsAt: new Date('2026-10-15T22:30:00.000Z'),
  endsAt: null,
  location: 'Clubhouse',
  noticePostedAt: null,
  minutesApprovedAt: null,
  minutesDocumentId: null,
};

/**
 * `meeting`: what the meetings table holds (null = not in this community).
 * `document`: the posted document, or null when it is a draft, deleted or in
 * another community (the scoped `isNotNull(posted_at)` read finds nothing).
 */
function mockDb({
  meeting = HELD_MEETING as Record<string, unknown> | null,
  document = { id: 30, postedAt: POSTED_AT } as Record<string, unknown> | null,
  attached = false,
  /** Another request named different minutes between our read and our write. */
  loseRace = false,
} = {}) {
  const insertMock = vi.fn().mockResolvedValue([{ id: 1 }]);
  const updateMock = vi.fn(async (_table: unknown, values: Record<string, unknown>) =>
    loseRace && 'minutesDocumentId' in values ? [] : [{ id: 7 }],
  );
  let meetingReads = 0;
  createScopedClientMock.mockReturnValue({
    selectFrom: vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        meetingReads += 1;
        if (!meeting) return rows([]);
        return rows([loseRace && meetingReads > 1 ? { ...meeting, minutesDocumentId: 31 } : meeting]);
      }
      if (table === documentsTableMock) return rows(document ? [document] : []);
      if (table === meetingDocumentsTableMock) return rows(attached ? [{ id: 3 }] : []);
      return rows([]);
    }),
    insert: insertMock,
    update: updateMock,
  });
  return { insertMock, updateMock };
}

function recordMinutes(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-community-id': '42' },
      body: JSON.stringify({ action: 'record-minutes', communityId: 42, meetingId: 7, documentId: 30, ...body }),
    }),
  );
}

describe('meetings route — record-minutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    setDocumentReceivedAtMock.mockResolvedValue({ written: true, previous: null, receivedAt: new Date() });
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      permissions: { resources: { meetings: { read: true, write: true } } },
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
  });

  it('attaches the document, names it as the minutes and stamps the posting with its own posted_at', async () => {
    const { insertMock, updateMock } = mockDb();
    const response = await recordMinutes({});
    expect(response.status).toBe(200);

    expect(insertMock).toHaveBeenCalledWith(meetingDocumentsTableMock, {
      meetingId: 7,
      documentId: 30,
      attachedBy: 'user-1',
    });
    expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { minutesDocumentId: 30 }, expect.anything());
    expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { minutesApprovedAt: POSTED_AT }, expect.anything());
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'meeting_minutes_approved',
        resourceType: 'meeting',
        resourceId: '7',
        newValues: { minutesDocumentId: 30, minutesApprovedAt: POSTED_AT.toISOString() },
      }),
    );
  });

  it('writes the approval date to the document and audits it', async () => {
    mockDb();
    const approvedAt = '2026-11-03T23:59:59.999Z';
    await recordMinutes({ approvedAt });
    expect(setDocumentReceivedAtMock).toHaveBeenCalledWith(42, 30, new Date(approvedAt));
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'document',
        resourceId: '30',
        oldValues: { receivedAt: null },
        newValues: { receivedAt: approvedAt },
      }),
    );
  });

  it('does not attach a document twice', async () => {
    const { insertMock } = mockDb({ attached: true });
    await recordMinutes({});
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('refuses a meeting that has not been held (422)', async () => {
    const { updateMock } = mockDb({
      meeting: { ...HELD_MEETING, startsAt: new Date('2026-12-01T22:30:00.000Z') },
    });
    const response = await recordMinutes({});
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses a meeting that already names different minutes (409)', async () => {
    const { updateMock, insertMock } = mockDb({ meeting: { ...HELD_MEETING, minutesDocumentId: 31 } });
    const response = await recordMinutes({});
    expect(response.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('refuses (409) when a concurrent request named different minutes first, attaching and stamping nothing', async () => {
    const { insertMock, updateMock } = mockDb({ loseRace: true });
    const response = await recordMinutes({ approvedAt: '2026-11-03T23:59:59.999Z' });
    expect(response.status).toBe(409);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalledWith(meetingsTableMock, expect.objectContaining({ minutesApprovedAt: expect.anything() }), expect.anything());
    expect(setDocumentReceivedAtMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('keeps an EARLIER date already on the document, says so, and audits no date change', async () => {
    mockDb();
    const earlier = new Date('2026-10-01T00:00:00.000Z');
    setDocumentReceivedAtMock.mockResolvedValueOnce({ written: false, previous: earlier, receivedAt: earlier });
    const response = await recordMinutes({ approvedAt: '2026-11-03T23:59:59.999Z' });
    const json = (await response.json()) as { warnings?: Array<{ code: string }> };
    expect(json.warnings).toEqual([expect.objectContaining({ code: 'received_date_kept' })]);
    expect(logAuditEventMock).not.toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'document' }));
  });

  it('404s a document that is a draft or not in this community, writing nothing', async () => {
    const { updateMock, insertMock } = mockDb({ document: null });
    const response = await recordMinutes({ approvedAt: '2026-11-03T23:59:59.999Z' });
    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(setDocumentReceivedAtMock).not.toHaveBeenCalled();
  });

  it('404s a meeting that is not in this community', async () => {
    mockDb({ meeting: null });
    expect((await recordMinutes({})).status).toBe(404);
  });

  it('refuses an approval date in the future (422)', async () => {
    mockDb();
    const response = await recordMinutes({ approvedAt: '2026-12-25T00:00:00.000Z' });
    expect(response.status).toBe(422);
    expect(setDocumentReceivedAtMock).not.toHaveBeenCalled();
  });

  it('requires meetings:write', async () => {
    mockDb();
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      permissions: { resources: { meetings: { read: true, write: false } } },
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
    expect((await recordMinutes({})).status).toBe(403);
  });
});
