/**
 * Integration test: meeting creation triggers meeting-notice notification (P2-41).
 *
 * Verifies that when a meeting is created via the meetings route handler,
 * the notification service is called with the correct parameters.
 *
 * CONSISTENCY NOTE (Issue 1b):
 * This file mocks withErrorHandler as a bare passthrough: `(fn) => fn`.
 * meetings/route.test.ts does NOT mock withErrorHandler — it relies on the
 * real implementation to serialize errors into JSON HTTP responses.
 * Tests here only verify notification side-effects on the happy path.
 * HTTP error status code assertions (401, 403, etc.) belong in meetings/route.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock queueNotification before importing the route
const queueNotificationMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: queueNotificationMock,
  createNotificationsForEvent: vi.fn().mockResolvedValue({ created: 0, skipped: 0 }),
}));

const {
  createScopedClientMock,
  communitiesTableMock,
  documentsTableMock,
  logAuditEventMock,
  meetingDocumentsTableMock,
  meetingsTableMock,
  requireAuthMock,
  requireCommunityMembershipMock,
  resolveEffectiveMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  communitiesTableMock: {
    id: Symbol('communities.id'),
    timezone: Symbol('communities.timezone'),
  },
  documentsTableMock: {
    id: Symbol('documents.id'),
  },
  logAuditEventMock: vi.fn(),
  meetingDocumentsTableMock: {
    meetingId: Symbol('meetingDocuments.meetingId'),
    documentId: Symbol('meetingDocuments.documentId'),
  },
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
  requireAuthMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities: communitiesTableMock,
  documents: documentsTableMock,
  meetings: meetingsTableMock,
  meetingDocuments: meetingDocumentsTableMock,
}));

vi.mock('@propertypro/shared', () => ({
  // meetings route imports CommunityType (type only) — no runtime values needed
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: vi.fn(), // no-op: this test focuses on notification side-effects, not RBAC
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  NotFoundError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveMock,
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: (e: unknown) => [],
}));

vi.mock('@/lib/utils/meeting-calculator', () => ({
  calculateMinutesPostingDeadline: () => new Date(),
  calculateNoticePostBy: () => new Date(),
  calculateOwnerVoteDocsDeadline: () => new Date(),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { POST } from '../../src/app/api/v1/meetings/route';

describe('meeting creation triggers notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } }, communityType: 'condo_718' });
    resolveEffectiveMock.mockImplementation((_req: unknown, id: number) => id);
    logAuditEventMock.mockResolvedValue(undefined);

    const createdMeeting = {
      id: 1,
      communityId: 5,
      title: 'Annual Budget Meeting',
      meetingType: 'annual',
      startsAt: new Date('2026-04-15T19:00:00.000Z'),
      endsAt: null,
      location: 'Clubhouse',
      noticePostedAt: null,
      minutesApprovedAt: null,
    };

    const selectFromMock = vi.fn((table: unknown) => {
      if (table === meetingsTableMock) {
        return Promise.resolve([createdMeeting]);
      }
      if (table === communitiesTableMock) {
        return Promise.resolve([{ timezone: 'America/New_York' }]);
      }
      return Promise.resolve([]);
    });

    createScopedClientMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue([createdMeeting]),
      query: vi.fn().mockResolvedValue([]),
      selectFrom: selectFromMock,
    });
  });

  it('calls queueNotification with meeting_notice after creating a meeting', async () => {
    const body = {
      communityId: 5,
      title: 'Annual Budget Meeting',
      meetingType: 'annual',
      startsAt: '2026-04-15T19:00:00.000Z',
      location: 'Clubhouse',
    };

    const request = new Request('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(request as unknown as import('next/server').NextRequest);

    expect(queueNotificationMock).toHaveBeenCalledTimes(1);
    expect(queueNotificationMock).toHaveBeenCalledWith(
      5, // communityId
      expect.objectContaining({
        type: 'meeting_notice',
        meetingTitle: 'Annual Budget Meeting',
        location: 'Clubhouse',
        sourceType: 'meeting',
        sourceId: '1',
      }),
      'all',
      'user-1',
    );
  });

  it('does not call queueNotification for update action', async () => {
    const createdMeeting = {
      id: 1,
      communityId: 5,
      title: 'Existing Meeting',
      meetingType: 'board',
      startsAt: new Date('2026-04-15T19:00:00.000Z'),
      location: 'Clubhouse',
    };

    createScopedClientMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue([createdMeeting]),
      query: vi.fn().mockResolvedValue([createdMeeting]),
      selectFrom: vi.fn().mockResolvedValue([createdMeeting]),
      update: vi.fn().mockResolvedValue([{ ...createdMeeting, title: 'Updated Meeting' }]),
    });

    const body = {
      action: 'update',
      id: 1,
      communityId: 5,
      title: 'Updated Meeting',
    };

    const request = new Request('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(request as unknown as import('next/server').NextRequest);

    expect(queueNotificationMock).not.toHaveBeenCalled();
  });
});
