import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendEmailMock,
  enqueueDigestItemsMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  enqueueDigestItemsMock: vi.fn().mockResolvedValue({ enqueued: 0, duplicates: 0 }),
  tables: {
    userRoles: Symbol('user_roles'),
    users: Symbol('users'),
    notificationPreferences: Symbol('notification_preferences'),
    communities: Symbol('communities'),
    announcementDeliveryLog: { id: Symbol('announcement_delivery_log.id') },
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  userRoles: tables.userRoles,
  users: tables.users,
  notificationPreferences: tables.notificationPreferences,
  communities: tables.communities,
  announcementDeliveryLog: tables.announcementDeliveryLog,
}));

vi.mock('@propertypro/email', () => ({
  AnnouncementEmail: (props: unknown) => ({ type: 'AnnouncementEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/services/notification-digest-queue', () => ({
  enqueueDigestItems: enqueueDigestItemsMock,
}));

import { queueAnnouncementDelivery } from '../../src/lib/services/announcement-delivery';

describe('announcement email delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    enqueueDigestItemsMock.mockResolvedValue({ enqueued: 0, duplicates: 0 });
  });

  it('splits immediate and digest recipients by email frequency', async () => {
    const deliveryRows: Array<Record<string, unknown>> = [];
    const query = vi.fn(async (table: unknown) => {
      if (table === tables.userRoles) {
        return [
          { userId: 'u-owner', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } },
          { userId: 'u-board', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } },
          { userId: 'u-tenant', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant' },
        ];
      }
      if (table === tables.users) {
        return [
          { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner' },
          { id: 'u-board', email: 'board@example.com', fullName: 'Board' },
          { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant' },
        ];
      }
      if (table === tables.notificationPreferences) {
        return [
          { userId: 'u-owner', emailAnnouncements: true, emailFrequency: 'immediate' },
          { userId: 'u-board', emailAnnouncements: true, emailFrequency: 'daily_digest' },
          { userId: 'u-tenant', emailAnnouncements: false },
        ];
      }
      if (table === tables.communities) {
        return [{ id: 5, name: 'Sunset Condos' }];
      }
      if (table === tables.announcementDeliveryLog) {
        return deliveryRows;
      }
      return [];
    });

    const insert = vi.fn(async (table: unknown, data: Record<string, unknown>) => {
      if (table === tables.announcementDeliveryLog) {
        const row = { id: deliveryRows.length + 1, attemptCount: 0, ...data };
        deliveryRows.push(row);
        return [row];
      }
      return [];
    });

    const update = vi.fn().mockResolvedValue([]);

    createScopedClientMock.mockReturnValue({
      query,
      insert,
      update,
    });

    const count = await queueAnnouncementDelivery({
      communityId: 5,
      announcementId: 10,
      audience: 'board_only',
      title: 'Board Update',
      body: 'Body',
      isPinned: false,
      authorName: 'Admin',
    });

    expect(count).toBe(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com' }),
    );
    expect(deliveryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          announcementId: 10,
          userId: 'u-owner',
          status: 'pending',
        }),
        expect.objectContaining({
          announcementId: 10,
          userId: 'u-board',
          status: 'queued_digest',
        }),
      ]),
    );
    expect(enqueueDigestItemsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'u-board',
          frequency: 'daily_digest',
          sourceType: 'announcement',
          sourceId: '10',
        }),
      ]),
    );
    expect(update).toHaveBeenCalled();
  });

  it('delivers large recipient lists and returns total count', async () => {
    const recipientCount = 205;
    const roleRows = Array.from({ length: recipientCount }, (_, index) => ({
      userId: `u-${index + 1}`,
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
    }));
    const userRows = Array.from({ length: recipientCount }, (_, index) => ({
      id: `u-${index + 1}`,
      email: `u-${index + 1}@example.com`,
      fullName: `User ${index + 1}`,
    }));
    const preferenceRows = Array.from({ length: recipientCount }, (_, index) => ({
      userId: `u-${index + 1}`,
      emailAnnouncements: true,
    }));

    const deliveryRows: Array<Record<string, unknown>> = [];
    const query = vi.fn(async (table: unknown) => {
      if (table === tables.userRoles) return roleRows;
      if (table === tables.users) return userRows;
      if (table === tables.notificationPreferences) return preferenceRows;
      if (table === tables.communities) return [{ id: 5, name: 'Sunset Condos' }];
      if (table === tables.announcementDeliveryLog) return deliveryRows;
      return [];
    });
    const insert = vi.fn(async (table: unknown, data: Record<string, unknown>) => {
      if (table === tables.announcementDeliveryLog) {
        const row = { id: deliveryRows.length + 1, attemptCount: 0, ...data };
        deliveryRows.push(row);
        return [row];
      }
      return [];
    });

    createScopedClientMock.mockReturnValue({
      query,
      insert,
      update: vi.fn().mockResolvedValue([]),
    });

    const count = await queueAnnouncementDelivery({
      communityId: 5,
      announcementId: 11,
      audience: 'all',
      title: 'Community Update',
      body: 'Body',
      isPinned: true,
      authorName: 'Admin',
    });

    expect(count).toBe(recipientCount);
    expect(sendEmailMock).toHaveBeenCalledTimes(recipientCount);
    expect(enqueueDigestItemsMock).not.toHaveBeenCalled();
  });
});
