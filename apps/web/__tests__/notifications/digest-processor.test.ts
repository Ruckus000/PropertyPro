import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findCandidateDigestCommunityIdsMock,
  claimDigestQueueRowsMock,
  hasMoreDigestRowsMock,
  createScopedClientMock,
  sendEmailMock,
  updateQueuedDigestAnnouncementStatusMock,
  tables,
  queryState,
  updateMock,
} = vi.hoisted(() => ({
  findCandidateDigestCommunityIdsMock: vi.fn(),
  claimDigestQueueRowsMock: vi.fn(),
  hasMoreDigestRowsMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  updateQueuedDigestAnnouncementStatusMock: vi.fn().mockResolvedValue(undefined),
  tables: {
    announcements: Symbol('announcements'),
    meetings: Symbol('meetings'),
    maintenanceRequests: Symbol('maintenance_requests'),
    documents: Symbol('documents'),
    communities: Symbol('communities'),
    users: Symbol('users'),
    notificationPreferences: Symbol('notification_preferences'),
    notificationDigestQueue: { id: Symbol('notification_digest_queue.id') },
  },
  queryState: new Map<number, {
    communities: Array<Record<string, unknown>>;
    users: Array<Record<string, unknown>>;
    preferences: Array<Record<string, unknown>>;
  }>(),
  updateMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  announcements: tables.announcements,
  meetings: tables.meetings,
  maintenanceRequests: tables.maintenanceRequests,
  documents: tables.documents,
  communities: tables.communities,
  users: tables.users,
  notificationPreferences: tables.notificationPreferences,
  notificationDigestQueue: tables.notificationDigestQueue,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findCandidateDigestCommunityIds: findCandidateDigestCommunityIdsMock,
  claimDigestQueueRows: claimDigestQueueRowsMock,
  hasMoreDigestRows: hasMoreDigestRowsMock,
}));

vi.mock('@propertypro/email', () => ({
  NotificationDigestEmail: (props: unknown) => ({ type: 'NotificationDigestEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  updateQueuedDigestAnnouncementStatus: updateQueuedDigestAnnouncementStatusMock,
}));

import { processNotificationDigests } from '../../src/lib/services/notification-digest-processor';

function seedCommunityState(params: {
  communityId: number;
  timezone: string;
  users?: Array<Record<string, unknown>>;
  preferences?: Array<Record<string, unknown>>;
  name?: string;
}) {
  queryState.set(params.communityId, {
    communities: [
      {
        id: params.communityId,
        name: params.name ?? `Community ${params.communityId}`,
        timezone: params.timezone,
      },
    ],
    users: params.users ?? [],
    preferences: params.preferences ?? [],
  });
}

describe('notification digest processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.clear();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    hasMoreDigestRowsMock.mockResolvedValue(false);

    createScopedClientMock.mockImplementation((communityId: number) => ({
      query: vi.fn(async (table: unknown) => {
        const state = queryState.get(communityId);
        if (!state) return [];
        if (table === tables.communities) return state.communities;
        if (table === tables.users) return state.users;
        if (table === tables.notificationPreferences) return state.preferences;
        return [];
      }),
      queryIncludingDeleted: vi.fn(async () => []),
      update: updateMock,
    }));
  });

  it('processes only communities currently in local 8 AM window (ET/CT behavior)', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101, 202]);
    claimDigestQueueRowsMock.mockImplementation(async ({ communityId }: { communityId: number }) => {
      if (communityId === 101) {
        return [
          {
            id: 1,
            communityId: 101,
            userId: 'u-1',
            frequency: 'daily_digest',
            sourceType: 'document',
            sourceId: 'doc-1',
            eventType: 'document_posted',
            eventTitle: 'Q4 Budget',
            eventSummary: 'Uploaded by board',
            actionUrl: 'https://app.local/documents/doc-1',
            attemptCount: 0,
          },
        ];
      }
      return [];
    });

    seedCommunityState({
      communityId: 101,
      timezone: 'America/New_York',
      users: [{ id: 'u-1', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
      preferences: [{ userId: 'u-1', emailFrequency: 'daily_digest', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true }],
    });
    seedCommunityState({
      communityId: 202,
      timezone: 'America/Chicago',
      users: [{ id: 'u-2', email: 'tenant@example.com', fullName: 'Tenant', deletedAt: null }],
      preferences: [{ userId: 'u-2', emailFrequency: 'daily_digest', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true }],
    });

    const summary = await processNotificationDigests({
      now: new Date('2026-02-18T13:15:00.000Z'), // 8:15 ET / 7:15 CT
    });

    expect(summary.communitiesScanned).toBe(2);
    expect(summary.communitiesProcessed).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(claimDigestQueueRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 101,
      }),
    );
    expect(claimDigestQueueRowsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 202,
      }),
    );
  });

  it('includes weekly frequency claims only on Monday local window', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    claimDigestQueueRowsMock.mockResolvedValue([]);
    seedCommunityState({ communityId: 101, timezone: 'America/New_York' });

    await processNotificationDigests({
      now: new Date('2026-03-02T13:10:00.000Z'), // Monday 8:10 ET
    });

    expect(claimDigestQueueRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 101,
        frequencies: ['daily_digest', 'weekly_digest'],
      }),
    );
  });

  it('retries failed sends with backoff and marks terminal failures', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    seedCommunityState({
      communityId: 101,
      timezone: 'America/New_York',
      users: [{ id: 'u-1', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
      preferences: [{ userId: 'u-1', emailFrequency: 'daily_digest', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true }],
    });

    claimDigestQueueRowsMock.mockResolvedValueOnce([
      {
        id: 1,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'document',
        sourceId: 'doc-1',
        eventType: 'document_posted',
        eventTitle: 'Q4 Budget',
        eventSummary: 'Uploaded by board',
        actionUrl: 'https://app.local/documents/doc-1',
        attemptCount: 0,
      },
    ]);
    sendEmailMock.mockRejectedValueOnce(new Error('provider timeout'));

    const retrySummary = await processNotificationDigests({
      now: new Date('2026-02-18T13:20:00.000Z'),
    });

    expect(retrySummary.rowsRetried).toBe(1);
    expect(updateMock).toHaveBeenCalledWith(
      tables.notificationDigestQueue,
      expect.objectContaining({
        status: 'pending',
        attemptCount: 1,
      }),
      expect.anything(),
    );

    vi.clearAllMocks();
    sendEmailMock.mockRejectedValueOnce(new Error('provider timeout'));
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    claimDigestQueueRowsMock.mockResolvedValue([
      {
        id: 2,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'document',
        sourceId: 'doc-2',
        eventType: 'document_posted',
        eventTitle: 'Q1 Budget',
        eventSummary: 'Uploaded by board',
        actionUrl: 'https://app.local/documents/doc-2',
        attemptCount: 4,
      },
    ]);
    createScopedClientMock.mockImplementation((communityId: number) => ({
      query: vi.fn(async (table: unknown) => {
        const state = queryState.get(communityId);
        if (!state) return [];
        if (table === tables.communities) return state.communities;
        if (table === tables.users) return state.users;
        if (table === tables.notificationPreferences) return state.preferences;
        return [];
      }),
      queryIncludingDeleted: vi.fn(async () => []),
      update: updateMock,
    }));

    const terminalSummary = await processNotificationDigests({
      now: new Date('2026-02-18T13:25:00.000Z'),
    });

    expect(terminalSummary.rowsFailed).toBe(1);
    expect(updateMock).toHaveBeenCalledWith(
      tables.notificationDigestQueue,
      expect.objectContaining({
        status: 'failed',
        attemptCount: 5,
      }),
      expect.anything(),
    );
  });

  it('drops digest rows whose source announcement was soft-deleted and marks them discarded', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    hasMoreDigestRowsMock.mockResolvedValue(false);
    seedCommunityState({
      communityId: 101,
      timezone: 'America/New_York',
      users: [{ id: 'u-1', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
      preferences: [
        {
          userId: 'u-1',
          emailFrequency: 'daily_digest',
          emailAnnouncements: true,
          emailMeetings: true,
          inAppEnabled: true,
        },
      ],
    });

    claimDigestQueueRowsMock.mockResolvedValue([
      {
        id: 1,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'announcement',
        sourceId: '77',
        eventType: 'announcement',
        eventTitle: 'Withdrawn notice',
        eventSummary: 'Hidden after publish',
        actionUrl: 'https://app.local/announcements/77',
        attemptCount: 0,
      },
      {
        id: 2,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'announcement',
        sourceId: '88',
        eventType: 'announcement',
        eventTitle: 'Still live',
        eventSummary: 'Should send',
        actionUrl: 'https://app.local/announcements/88',
        attemptCount: 0,
      },
    ]);

    createScopedClientMock.mockImplementation((communityId: number) => ({
      query: vi.fn(async (table: unknown) => {
        const state = queryState.get(communityId);
        if (!state) return [];
        if (table === tables.communities) return state.communities;
        if (table === tables.users) return state.users;
        if (table === tables.notificationPreferences) return state.preferences;
        return [];
      }),
      queryIncludingDeleted: vi.fn(async (table: unknown) => {
        if (table !== tables.announcements) return [];
        return [
          { id: 77, deletedAt: new Date('2026-02-18T12:00:00.000Z') },
          { id: 88, deletedAt: null },
        ];
      }),
      update: updateMock,
    }));

    const summary = await processNotificationDigests({
      now: new Date('2026-02-18T13:30:00.000Z'),
    });

    expect(summary.rowsDiscarded).toBe(1);
    expect(summary.rowsSent).toBe(1);
    expect(summary.emailsSent).toBe(1);

    expect(updateQueuedDigestAnnouncementStatusMock).toHaveBeenCalledWith(
      101,
      77,
      'u-1',
      expect.objectContaining({
        status: 'discarded',
        errorMessage: 'Source announcement was deleted',
      }),
    );

    const sendCall = sendEmailMock.mock.calls[0]?.[0] as
      | { react: { props: { items: Array<{ title: string }> } } }
      | undefined;
    expect(sendCall?.react.props.items.map((item) => item.title)).toEqual(['Still live']);
  });

  it('drops digest rows whose source meeting/maintenance/document was soft-deleted', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    hasMoreDigestRowsMock.mockResolvedValue(false);
    seedCommunityState({
      communityId: 101,
      timezone: 'America/New_York',
      users: [{ id: 'u-1', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
      preferences: [
        {
          userId: 'u-1',
          emailFrequency: 'daily_digest',
          emailAnnouncements: true,
          emailMeetings: true,
          emailDocuments: true,
          inAppEnabled: true,
        },
      ],
    });

    claimDigestQueueRowsMock.mockResolvedValue([
      {
        id: 10,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'meeting',
        sourceId: '500',
        eventType: 'meeting_notice',
        eventTitle: 'Cancelled meeting',
        eventSummary: 'Was cancelled',
        actionUrl: 'https://app.local/meetings/500',
        attemptCount: 0,
      },
      {
        id: 11,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'maintenance',
        sourceId: '600',
        eventType: 'maintenance_update',
        eventTitle: 'Withdrawn request',
        eventSummary: 'No longer applies',
        actionUrl: 'https://app.local/maintenance/600',
        attemptCount: 0,
      },
      {
        id: 12,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'document',
        sourceId: '700',
        eventType: 'document_posted',
        eventTitle: 'Retracted doc',
        eventSummary: 'Removed by author',
        actionUrl: 'https://app.local/documents/700',
        attemptCount: 0,
      },
      {
        id: 13,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'meeting',
        sourceId: '501',
        eventType: 'meeting_notice',
        eventTitle: 'Live meeting',
        eventSummary: 'Should send',
        actionUrl: 'https://app.local/meetings/501',
        attemptCount: 0,
      },
    ]);

    createScopedClientMock.mockImplementation((communityId: number) => ({
      query: vi.fn(async (table: unknown) => {
        const state = queryState.get(communityId);
        if (!state) return [];
        if (table === tables.communities) return state.communities;
        if (table === tables.users) return state.users;
        if (table === tables.notificationPreferences) return state.preferences;
        return [];
      }),
      queryIncludingDeleted: vi.fn(async (table: unknown) => {
        if (table === tables.meetings) {
          return [
            { id: 500, deletedAt: new Date('2026-02-18T12:00:00.000Z') },
            { id: 501, deletedAt: null },
          ];
        }
        if (table === tables.maintenanceRequests) {
          return [{ id: 600, deletedAt: new Date('2026-02-18T12:00:00.000Z') }];
        }
        if (table === tables.documents) {
          return [{ id: 700, deletedAt: new Date('2026-02-18T12:00:00.000Z') }];
        }
        if (table === tables.announcements) return [];
        return [];
      }),
      update: updateMock,
    }));

    const summary = await processNotificationDigests({
      now: new Date('2026-02-18T13:30:00.000Z'),
    });

    expect(summary.rowsDiscarded).toBe(3);
    expect(summary.rowsSent).toBe(1);
    expect(summary.emailsSent).toBe(1);

    const discardReasons = updateMock.mock.calls
      .filter(
        (call) => (call[1] as Record<string, unknown>)['status'] === 'discarded',
      )
      .map((call) => (call[1] as Record<string, unknown>)['errorMessage']);
    expect(discardReasons).toEqual(
      expect.arrayContaining([
        'Source meeting was deleted',
        'Source maintenance request was deleted',
        'Source document was deleted',
      ]),
    );

    // Only the live meeting survives to the email
    const sendCall = sendEmailMock.mock.calls[0]?.[0] as
      | { react: { props: { items: Array<{ title: string }> } } }
      | undefined;
    expect(sendCall?.react.props.items.map((item) => item.title)).toEqual(['Live meeting']);

    // Non-announcement discards must NOT call the announcement-status side effect
    expect(updateQueuedDigestAnnouncementStatusMock).not.toHaveBeenCalled();
  });

  it('respects per-tick email cap and reports hasMore', async () => {
    findCandidateDigestCommunityIdsMock.mockResolvedValue([101]);
    hasMoreDigestRowsMock.mockResolvedValue(true);
    seedCommunityState({
      communityId: 101,
      timezone: 'America/New_York',
      users: [
        { id: 'u-1', email: 'owner1@example.com', fullName: 'Owner 1', deletedAt: null },
        { id: 'u-2', email: 'owner2@example.com', fullName: 'Owner 2', deletedAt: null },
      ],
      preferences: [
        { userId: 'u-1', emailFrequency: 'daily_digest', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true },
        { userId: 'u-2', emailFrequency: 'daily_digest', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true },
      ],
    });
    claimDigestQueueRowsMock.mockResolvedValue([
      {
        id: 1,
        communityId: 101,
        userId: 'u-1',
        frequency: 'daily_digest',
        sourceType: 'document',
        sourceId: 'doc-1',
        eventType: 'document_posted',
        eventTitle: 'Q4 Budget',
        eventSummary: 'Uploaded by board',
        actionUrl: 'https://app.local/documents/doc-1',
        attemptCount: 0,
      },
      {
        id: 2,
        communityId: 101,
        userId: 'u-2',
        frequency: 'daily_digest',
        sourceType: 'document',
        sourceId: 'doc-2',
        eventType: 'document_posted',
        eventTitle: 'Q1 Budget',
        eventSummary: 'Uploaded by board',
        actionUrl: 'https://app.local/documents/doc-2',
        attemptCount: 0,
      },
    ]);

    const summary = await processNotificationDigests({
      now: new Date('2026-02-18T13:30:00.000Z'),
      emailsPerTick: 1,
    });

    expect(summary.emailsSent).toBe(1);
    expect(summary.hasMore).toBe(true);
  });
});
