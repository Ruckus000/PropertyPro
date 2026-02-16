import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  notificationDigestQueueTable,
  insertMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  notificationDigestQueueTable: Symbol('notification_digest_queue'),
  insertMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  notificationDigestQueue: notificationDigestQueueTable,
}));

import {
  enqueueDigestItem,
  enqueueDigestItems,
} from '../../src/lib/services/notification-digest-queue';

describe('notification digest queue service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue([{ id: 1 }]);
    createScopedClientMock.mockReturnValue({
      insert: insertMock,
    });
  });

  it('enqueues digest row with expected metadata', async () => {
    const result = await enqueueDigestItem({
      communityId: 11,
      userId: 'user-1',
      frequency: 'daily_digest',
      sourceType: 'meeting',
      sourceId: 'meeting-7',
      eventType: 'meeting_notice',
      eventTitle: 'Board Meeting',
      eventSummary: 'Tomorrow at 7 PM',
      actionUrl: 'https://app.local/meetings/7',
    });

    expect(result.enqueued).toBe(true);
    expect(createScopedClientMock).toHaveBeenCalledWith(11);
    expect(insertMock).toHaveBeenCalledWith(
      notificationDigestQueueTable,
      expect.objectContaining({
        userId: 'user-1',
        frequency: 'daily_digest',
        sourceType: 'meeting',
        sourceId: 'meeting-7',
        eventType: 'meeting_notice',
        eventTitle: 'Board Meeting',
        eventSummary: 'Tomorrow at 7 PM',
        actionUrl: 'https://app.local/meetings/7',
        status: 'pending',
      }),
    );
  });

  it('treats unique violations as idempotent duplicate inserts', async () => {
    const duplicateError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    insertMock.mockRejectedValueOnce(duplicateError);

    const result = await enqueueDigestItem({
      communityId: 11,
      userId: 'user-1',
      frequency: 'weekly_digest',
      sourceType: 'announcement',
      sourceId: 'ann-10',
      eventType: 'announcement',
      eventTitle: 'Board Update',
    });

    expect(result).toEqual({ enqueued: false });
  });

  it('returns aggregate enqueue/duplicate counts for batch inserts', async () => {
    const duplicateError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    insertMock
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce([{ id: 2 }]);

    const result = await enqueueDigestItems([
      {
        communityId: 11,
        userId: 'user-1',
        frequency: 'daily_digest',
        sourceType: 'meeting',
        sourceId: 'm-1',
        eventType: 'meeting_notice',
        eventTitle: 'Meeting A',
      },
      {
        communityId: 11,
        userId: 'user-1',
        frequency: 'daily_digest',
        sourceType: 'meeting',
        sourceId: 'm-1',
        eventType: 'meeting_notice',
        eventTitle: 'Meeting A',
      },
      {
        communityId: 11,
        userId: 'user-2',
        frequency: 'weekly_digest',
        sourceType: 'document',
        sourceId: 'd-5',
        eventType: 'document_posted',
        eventTitle: 'Budget Report',
      },
    ]);

    expect(result).toEqual({
      enqueued: 2,
      duplicates: 1,
    });
  });
});
