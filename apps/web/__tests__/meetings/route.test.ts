import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
  queueNotificationMock,
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
  queueNotificationMock: vi.fn().mockResolvedValue(undefined),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    title: Symbol('meetings.title'),
    meetingType: Symbol('meetings.meetingType'),
    startsAt: Symbol('meetings.startsAt'),
    endsAt: Symbol('meetings.endsAt'),
    location: Symbol('meetings.location'),
    agenda: Symbol('meetings.agenda'),
    agendaPublished: Symbol('meetings.agendaPublished'),
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
    and: vi.fn((...parts) => ({ type: 'and', parts })),
    asc: vi.fn((value) => ({ type: 'asc', value })),
    eq: vi.fn((left, right) => ({ type: 'eq', left, right })),
    gte: vi.fn((left, right) => ({ type: 'gte', left, right })),
    lt: vi.fn((left, right) => ({ type: 'lt', left, right })),
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
  queueNotification: queueNotificationMock,
  createNotificationsForEvent: vi.fn().mockResolvedValue({ created: 0, skipped: 0 }),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST } from '../../src/app/api/v1/meetings/route';

describe('meetings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Board President',
      presetKey: 'board_president',
      permissions: {
        resources: {
          documents: { read: true, write: true },
          meetings: { read: true, write: true },
          announcements: { read: true, write: true },
          residents: { read: true, write: true },
          settings: { read: true, write: true },
          audit: { read: true, write: false },
          compliance: { read: true, write: true },
          maintenance: { read: true, write: true },
          contracts: { read: true, write: true },
          finances: { read: true, write: true },
          violations: { read: true, write: true },
          arc_submissions: { read: true, write: true },
          polls: { read: true, write: true },
          work_orders: { read: true, write: true },
          amenities: { read: true, write: true },
          packages: { read: true, write: true },
          visitors: { read: true, write: true },
          calendar_sync: { read: true, write: true },
          accounting: { read: true, write: true },
          esign: { read: true, write: true },
          emergency_broadcasts: { read: true, write: true },
        },
      },
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
  });

  it('GET lists meetings and applies a DB-level date range filter when start and end are provided', async () => {
    const meetingRows = [
      {
        id: 1,
        title: 'Board Meeting',
        meetingType: 'board',
        startsAt: new Date('2026-04-10T22:00:00.000Z'),
        endsAt: new Date('2026-04-10T23:00:00.000Z'),
        location: 'Clubhouse',
        noticePostedAt: null,
        minutesApprovedAt: null,
      },
    ];
    const selectFromMock = vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        return makeSelectResult(meetingRows);
      }
      return makeSelectResult([]);
    });

    createScopedClientMock.mockReturnValue({
      selectFrom: selectFromMock,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/meetings?communityId=42&start=2026-04-01&end=2026-04-30'),
    );
    const json = (await response.json()) as { data: Array<{ id: number; deadlines: Record<string, string> }> };

    expect(response.status).toBe(200);
    expect(selectFromMock).toHaveBeenCalledWith(
      meetingsTableMock,
      expect.any(Object),
      expect.anything(),
    );
    expect(json.data).toHaveLength(1);
    expect(json.data[0]?.id).toBe(1);
    expect(json.data[0]?.deadlines).toBeDefined();
  });

  it('POST create persists endsAt and returns the serialized meeting payload', async () => {
    const insertMock = vi.fn().mockResolvedValue([{ id: 99 }]);
    const selectFromMock = vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        return makeSelectResult([
          {
            id: 99,
            title: 'Annual Meeting',
            meetingType: 'annual',
            startsAt: new Date('2026-04-18T14:00:00.000Z'),
            endsAt: new Date('2026-04-18T16:00:00.000Z'),
            location: 'Main Hall',
            noticePostedAt: null,
            minutesApprovedAt: null,
          },
        ]);
      }
      if (table === communitiesTableMock) {
        return makeSelectResult([{ timezone: 'America/New_York' }]);
      }
      return makeSelectResult([]);
    });

    createScopedClientMock.mockReturnValue({
      selectFrom: selectFromMock,
      insert: insertMock,
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 77,
          title: 'Annual Meeting',
          meetingType: 'annual',
          startsAt: '2026-04-18T14:00:00.000Z',
          endsAt: '2026-04-18T16:00:00.000Z',
          location: 'Main Hall',
        }),
      }),
    );
    const json = (await response.json()) as { data: { id: number; endsAt: string | null } };

    expect(response.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(
      meetingsTableMock,
      expect.objectContaining({
        title: 'Annual Meeting',
        meetingType: 'annual',
        endsAt: new Date('2026-04-18T16:00:00.000Z'),
      }),
    );
    expect(json.data.id).toBe(99);
    expect(json.data.endsAt).toBe('2026-04-18T16:00:00.000Z');
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(77);
    expect(queueNotificationMock).toHaveBeenCalled();
  });

  it('POST create rejects an end time that is not after the start time', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Invalid Meeting',
          meetingType: 'board',
          startsAt: '2026-04-18T16:00:00.000Z',
          endsAt: '2026-04-18T15:00:00.000Z',
          location: 'Clubhouse',
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it('POST update validates endsAt against the existing startsAt when only the end changes', async () => {
    const selectFromMock = vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        return makeSelectResult([
          {
            id: 5,
            title: 'Board Meeting',
            meetingType: 'board',
            startsAt: new Date('2026-05-01T16:00:00.000Z'),
            endsAt: new Date('2026-05-01T17:00:00.000Z'),
            location: 'Room A',
            noticePostedAt: null,
            minutesApprovedAt: null,
          },
        ]);
      }
      return makeSelectResult([]);
    });

    createScopedClientMock.mockReturnValue({
      selectFrom: selectFromMock,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          communityId: 42,
          id: 5,
          endsAt: '2026-05-01T15:30:00.000Z',
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it('allows apartment manager roles to read and write meetings', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Site Manager',
      presetKey: 'site_manager',
      permissions: {
        resources: {
          documents: { read: true, write: true },
          meetings: { read: true, write: true },
          announcements: { read: true, write: true },
          residents: { read: true, write: true },
          settings: { read: true, write: false },
          audit: { read: true, write: false },
          compliance: { read: false, write: false },
          maintenance: { read: true, write: true },
          contracts: { read: true, write: true },
          finances: { read: true, write: true },
          violations: { read: false, write: false },
          arc_submissions: { read: false, write: false },
          polls: { read: true, write: true },
          work_orders: { read: true, write: true },
          amenities: { read: true, write: true },
          packages: { read: true, write: true },
          visitors: { read: true, write: true },
          calendar_sync: { read: true, write: true },
          accounting: { read: true, write: true },
          esign: { read: true, write: true },
          emergency_broadcasts: { read: true, write: true },
        },
      },
      communityType: 'apartment',
      timezone: 'America/New_York',
    });

    const selectFromMock = vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        return makeSelectResult([
          {
            id: 7,
            title: 'Leasing Update',
            meetingType: 'committee',
            startsAt: new Date('2026-06-02T18:00:00.000Z'),
            endsAt: null,
            location: 'Leasing Office',
            noticePostedAt: null,
            minutesApprovedAt: null,
          },
        ]);
      }
      if (table === communitiesTableMock) {
        return makeSelectResult([{ timezone: 'America/New_York' }]);
      }
      return makeSelectResult([]);
    });
    const insertMock = vi.fn().mockResolvedValue([{ id: 8 }]);

    createScopedClientMock.mockReturnValue({
      selectFrom: selectFromMock,
      insert: insertMock,
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const getResponse = await GET(
      new NextRequest('http://localhost:3000/api/v1/meetings?communityId=42'),
    );
    expect(getResponse.status).toBe(200);

    const postResponse = await POST(
      new NextRequest('http://localhost:3000/api/v1/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Leasing Standup',
          meetingType: 'committee',
          startsAt: '2026-06-02T18:00:00.000Z',
          location: 'Leasing Office',
        }),
      }),
    );
    expect(postResponse.status).toBe(200);
  });

  it('GET rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/meetings?communityId=42'),
    );
    expect(response.status).toBe(401);
  });

  it('GET returns 403 for authenticated non-members', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());
    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/meetings?communityId=42'),
    );
    expect(response.status).toBe(403);
  });

  /**
   * #932 — the route says so when a schedule is already inside its notice
   * window, and never refuses it.
   *
   * The clock is frozen here for a reason beyond determinism: every other test
   * in this file hard-codes April 2026 dates, so as real time passed they
   * quietly crossed from "future meeting" to "past meeting". Without a fixed
   * `now` these assertions would flip meaning on an arbitrary date and read as
   * a regression in the route.
   */
  describe('agenda (audit 2026-11-05, H-4)', () => {
    const storedMeeting = (agenda: string | null) => ({
      id: 99,
      title: 'Annual Meeting',
      meetingType: 'annual',
      startsAt: new Date('2027-04-18T14:00:00.000Z'),
      endsAt: null,
      location: 'Main Hall',
      agenda,
      noticePostedAt: null,
      minutesApprovedAt: null,
    });

    function mockClient(agenda: string | null) {
      const insertMock = vi.fn().mockResolvedValue([{ id: 99 }]);
      const updateMock = vi.fn().mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue({
        selectFrom: vi.fn((table: unknown) => {
          if (table === meetingsTableMock) return makeSelectResult([storedMeeting(agenda)]);
          if (table === communitiesTableMock) return makeSelectResult([{ timezone: 'America/New_York' }]);
          return makeSelectResult([]);
        }),
        insert: insertMock,
        update: updateMock,
        softDelete: vi.fn(),
        hardDelete: vi.fn(),
      });
      return { insertMock, updateMock };
    }

    function post(body: Record<string, unknown>) {
      return POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, ...body }),
        }),
      );
    }

    const createBody = {
      title: 'Annual Meeting',
      meetingType: 'annual',
      startsAt: '2027-04-18T14:00:00.000Z',
      location: 'Main Hall',
    };

    it('create stores the agenda with its line breaks, trimmed at the ends, and audits it', async () => {
      const { insertMock } = mockClient('1. Call to order\n2. Budget');
      const response = await post({ ...createBody, agenda: '  1. Call to order\n2. Budget \n' });
      const json = (await response.json()) as { data: { agenda: string | null } };

      expect(response.status).toBe(200);
      expect(insertMock).toHaveBeenCalledWith(
        meetingsTableMock,
        expect.objectContaining({ agenda: '1. Call to order\n2. Budget' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          newValues: expect.objectContaining({ agenda: '1. Call to order\n2. Budget' }),
        }),
      );
      expect(json.data.agenda).toBe('1. Call to order\n2. Budget');
    });

    it('create stores null for a missing or blank agenda', async () => {
      const { insertMock } = mockClient(null);
      await post(createBody);
      await post({ ...createBody, agenda: '   \n ' });
      expect(insertMock).toHaveBeenNthCalledWith(1, meetingsTableMock, expect.objectContaining({ agenda: null }));
      expect(insertMock).toHaveBeenNthCalledWith(2, meetingsTableMock, expect.objectContaining({ agenda: null }));
    });

    it('create refuses an agenda over 10,000 characters with a 422', async () => {
      const { insertMock } = mockClient(null);
      const response = await post({ ...createBody, agenda: 'x'.repeat(10_001) });
      expect(response.status).toBe(422);
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('update changes the agenda and audits old and new', async () => {
      const { updateMock } = mockClient('Old agenda');
      const response = await post({ action: 'update', id: 99, agenda: 'New agenda' });

      expect(response.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { agenda: 'New agenda' }, expect.anything());
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          oldValues: { agenda: 'Old agenda' },
          newValues: { agenda: 'New agenda' },
        }),
      );
    });

    it('update with a blank agenda clears it', async () => {
      const { updateMock } = mockClient('Old agenda');
      await post({ action: 'update', id: 99, agenda: '' });
      expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { agenda: null }, expect.anything());
    });

    it('update without an agenda leaves it untouched', async () => {
      const { updateMock } = mockClient('Old agenda');
      await post({ action: 'update', id: 99, location: 'Clubhouse' });
      expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { location: 'Clubhouse' }, expect.anything());
    });
  });

  // A closed session's agenda can be kept off the PUBLIC website. Default on,
  // because the statute posts the agenda with the notice.
  describe('agenda on the public website', () => {
    function mockClient(agendaPublished: boolean) {
      const insertMock = vi.fn().mockResolvedValue([{ id: 99 }]);
      const updateMock = vi.fn().mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue({
        selectFrom: vi.fn((table: unknown) => {
          if (table === meetingsTableMock) {
            return makeSelectResult([
              {
                id: 99,
                title: 'Closed session',
                meetingType: 'board',
                startsAt: new Date('2027-04-18T14:00:00.000Z'),
                endsAt: null,
                location: 'Main Hall',
                agenda: '1. Litigation update',
                agendaPublished,
                noticePostedAt: null,
                minutesApprovedAt: null,
              },
            ]);
          }
          if (table === communitiesTableMock) return makeSelectResult([{ timezone: 'America/New_York' }]);
          return makeSelectResult([]);
        }),
        insert: insertMock,
        update: updateMock,
        softDelete: vi.fn(),
        hardDelete: vi.fn(),
      });
      return { insertMock, updateMock };
    }

    function post(body: Record<string, unknown>) {
      return POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, ...body }),
        }),
      );
    }

    const createBody = {
      title: 'Closed session',
      meetingType: 'board',
      startsAt: '2027-04-18T14:00:00.000Z',
      location: 'Main Hall',
      agenda: '1. Litigation update',
    };

    it('create publishes the agenda unless told otherwise, and audits the choice', async () => {
      const { insertMock } = mockClient(true);
      const response = await post(createBody);

      expect(response.status).toBe(200);
      expect(insertMock).toHaveBeenCalledWith(meetingsTableMock, expect.objectContaining({ agendaPublished: true }));
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create', newValues: expect.objectContaining({ agendaPublished: true }) }),
      );
    });

    it('create keeps the agenda off the website when agendaPublished is false', async () => {
      const { insertMock } = mockClient(false);
      const response = await post({ ...createBody, agendaPublished: false });
      const json = (await response.json()) as { data: { agendaPublished: boolean } };

      expect(response.status).toBe(200);
      expect(insertMock).toHaveBeenCalledWith(meetingsTableMock, expect.objectContaining({ agendaPublished: false }));
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create', newValues: expect.objectContaining({ agendaPublished: false }) }),
      );
      expect(json.data.agendaPublished).toBe(false);
    });

    it('refuses a value that is not a boolean with a 422', async () => {
      const { insertMock } = mockClient(true);
      const response = await post({ ...createBody, agendaPublished: 'no' });
      expect(response.status).toBe(422);
      expect(insertMock).not.toHaveBeenCalled();
    });

    // The service must READ the stored value. If its projection dropped the
    // column, every meeting would read as published and the edit form's next
    // save would re-publish a withheld agenda, with an audit of true -> true.
    it('reads the stored setting from the database', async () => {
      mockClient(false);
      await post({ action: 'update', id: 99, location: 'Clubhouse' });
      const selectFrom = createScopedClientMock.mock.results[0]!.value.selectFrom as ReturnType<typeof vi.fn>;
      const projection = selectFrom.mock.calls.find(([table]) => table === meetingsTableMock)?.[1];
      expect(projection).toMatchObject({ agendaPublished: meetingsTableMock.agendaPublished });
    });

    it('update re-publishes a withheld agenda only when asked, and audits the real old value', async () => {
      const { updateMock } = mockClient(false);
      const response = await post({ action: 'update', id: 99, agendaPublished: true });

      expect(response.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { agendaPublished: true }, expect.anything());
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          oldValues: { agendaPublished: false },
          newValues: { agendaPublished: true },
        }),
      );
    });

    it('update turns publishing off and audits old and new', async () => {
      const { updateMock } = mockClient(true);
      const response = await post({ action: 'update', id: 99, agendaPublished: false });

      expect(response.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(meetingsTableMock, { agendaPublished: false }, expect.anything());
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          oldValues: { agendaPublished: true },
          newValues: { agendaPublished: false },
        }),
      );
    });
  });

  describe('notice-window warnings', () => {
    const NOW = new Date('2026-04-01T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function mockMeetingRow(startsAt: string, meetingType: string) {
      const selectFromMock = vi.fn((table: unknown) => {
        if (table === meetingsTableMock) {
          return makeSelectResult([
            {
              id: 501,
              title: 'Scheduled Meeting',
              meetingType,
              startsAt: new Date(startsAt),
              endsAt: null,
              location: 'Clubhouse',
              noticePostedAt: null,
              minutesApprovedAt: null,
            },
          ]);
        }
        if (table === communitiesTableMock) {
          return makeSelectResult([{ timezone: 'America/New_York' }]);
        }
        return makeSelectResult([]);
      });

      createScopedClientMock.mockReturnValue({
        selectFrom: selectFromMock,
        insert: vi.fn().mockResolvedValue([{ id: 501 }]),
        update: vi.fn().mockResolvedValue([{ id: 501 }]),
        softDelete: vi.fn(),
        hardDelete: vi.fn(),
      });
    }

    async function createMeeting(startsAt: string, meetingType: string) {
      mockMeetingRow(startsAt, meetingType);
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId: 42,
            title: 'Scheduled Meeting',
            meetingType,
            startsAt,
            location: 'Clubhouse',
          }),
        }),
      );
      return {
        status: response.status,
        json: (await response.json()) as {
          data: { id: number };
          warnings?: Array<{ code: string; message: string }>;
        },
      };
    }

    it('omits warnings entirely for a compliant schedule', async () => {
      // 20 days out against a 14-day window. The absence of the key — not an
      // empty array — is what keeps the wire shape byte-identical to before.
      const { status, json } = await createMeeting('2026-04-21T12:00:00.000Z', 'annual');

      expect(status).toBe(200);
      expect(json.data.id).toBe(501);
      expect(json).not.toHaveProperty('warnings');
    });

    it('creates the meeting anyway and returns a warning when inside the window', async () => {
      // 4 days out against a 14-day window: 10 days short.
      const { status, json } = await createMeeting('2026-04-05T12:00:00.000Z', 'annual');

      // Created, not rejected — there is no emergency meeting type to fall back
      // on, so refusing would make a lawful short-notice meeting impossible.
      expect(status).toBe(200);
      expect(json.data.id).toBe(501);
      expect(json.warnings).toHaveLength(1);
      expect(json.warnings?.[0]?.code).toBe('notice_window_missed');
      expect(json.warnings?.[0]?.message).toContain('14-day notice window');
      expect(json.warnings?.[0]?.message).toContain('passed 10 days ago');
    });

    it('uses the 48-hour window for a board meeting, not the 14-day one', async () => {
      const compliant = await createMeeting('2026-04-04T12:00:00.000Z', 'board');
      expect(compliant.json).not.toHaveProperty('warnings');

      const short = await createMeeting('2026-04-02T00:00:00.000Z', 'board');
      expect(short.json.warnings?.[0]?.message).toContain('48-hour notice window');
    });

    it('warns on a reschedule that moves a meeting inside its window', async () => {
      mockMeetingRow('2026-04-03T12:00:00.000Z', 'annual');
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            communityId: 42,
            id: 501,
            startsAt: '2026-04-03T12:00:00.000Z',
          }),
        }),
      );
      const json = (await response.json()) as {
        warnings?: Array<{ code: string }>;
      };

      expect(response.status).toBe(200);
      expect(json.warnings?.[0]?.code).toBe('notice_window_missed');
    });
  });
});
