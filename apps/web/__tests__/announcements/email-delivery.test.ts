import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendEmailMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
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

import { queueAnnouncementDelivery } from '../../src/lib/services/announcement-delivery';

describe('announcement email delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
  });

  it('filters recipients by audience and announcement preference', async () => {
    const deliveryRows: Array<Record<string, unknown>> = [];
    const query = vi.fn(async (table: unknown) => {
      if (table === tables.userRoles) {
        return [
          { userId: 'u-owner', role: 'owner' },
          { userId: 'u-board', role: 'board_member' },
          { userId: 'u-tenant', role: 'tenant' },
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
          { userId: 'u-owner', emailAnnouncements: true },
          { userId: 'u-board', emailAnnouncements: true },
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

    expect(count).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'board@example.com' }),
    );
    expect(insert).toHaveBeenCalledWith(
      tables.announcementDeliveryLog,
      expect.objectContaining({
        announcementId: 10,
        userId: 'u-board',
        status: 'pending',
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it('delivers large recipient lists and returns total count', async () => {
    const recipientCount = 205;
    const roleRows = Array.from({ length: recipientCount }, (_, index) => ({
      userId: `u-${index + 1}`,
      role: 'owner',
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
  });
});
