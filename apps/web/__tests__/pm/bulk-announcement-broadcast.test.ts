import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insertMock, queryMock, getAnnouncementAuthorNameMock, queueAnnouncementDeliveryMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  queryMock: vi.fn(),
  getAnnouncementAuthorNameMock: vi.fn(),
  queueAnnouncementDeliveryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  // query() refuses, as the scoped client does for the platform-global `users`.
  createScopedClient: vi.fn(() => ({ insert: insertMock, query: queryMock })),
  announcements: Symbol('announcements'),
  users: Symbol('users'),
}));
vi.mock('@/lib/services/announcement-service', () => ({
  getAnnouncementAuthorName: getAnnouncementAuthorNameMock,
}));
vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: queueAnnouncementDeliveryMock,
}));

import { broadcastBulkAnnouncementToCommunity } from '../../src/lib/pm/bulk-announcement-broadcast';

describe('broadcastBulkAnnouncementToCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue([{ id: 55 }]);
    queryMock.mockRejectedValue(new Error('Unscoped query on table "users"'));
    getAnnouncementAuthorNameMock.mockResolvedValue('Pat Manager');
    queueAnnouncementDeliveryMock.mockResolvedValue(0);
  });

  it("names the author via the one-row lookup, not a read of every user", async () => {
    await broadcastBulkAnnouncementToCommunity({
      communityId: 7,
      userId: 'pm-1',
      title: 'Water shutoff',
      body: '<p>Tuesday</p>',
      sanitizedBody: '<p>Tuesday</p>',
      audience: 'all',
      isPinned: false,
    });

    expect(getAnnouncementAuthorNameMock).toHaveBeenCalledWith(7, 'pm-1');
    expect(queryMock).not.toHaveBeenCalled();
    expect(queueAnnouncementDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 7, announcementId: 55, authorName: 'Pat Manager' }),
    );
  });
});
