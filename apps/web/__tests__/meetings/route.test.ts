import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    expect(response.status).toBe(201);
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
    expect(postResponse.status).toBe(201);
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
});
