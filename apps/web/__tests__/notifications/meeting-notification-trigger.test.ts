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
}));

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthMock,
  requireCommunityMembershipMock,
  resolveEffectiveMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities: Symbol('communities'),
  documents: Symbol('documents'),
  meetings: { id: Symbol('meetings.id') },
  meetingDocuments: {
    meetingId: Symbol('meetingDocuments.meetingId'),
    documentId: Symbol('meetingDocuments.documentId'),
  },
}));

vi.mock('@propertypro/shared', () => ({
  // meetings route imports CommunityType
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

import { POST } from '../../src/app/api/v1/meetings/route';

describe('meeting creation triggers notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'board_president' });
    resolveEffectiveMock.mockImplementation((_req: unknown, id: number) => id);
    logAuditEventMock.mockResolvedValue(undefined);

    const createdMeeting = {
      id: 1,
      communityId: 5,
      title: 'Annual Budget Meeting',
      meetingType: 'annual',
      startsAt: new Date('2026-04-15T19:00:00.000Z'),
      location: 'Clubhouse',
    };

    createScopedClientMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue([createdMeeting]),
      query: vi.fn().mockResolvedValue([]),
      selectFrom: vi.fn().mockResolvedValue([]),
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
