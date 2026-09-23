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
    users: { __table: 'users', id: Symbol('users.id') },
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

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
}));

vi.mock('@propertypro/email', () => ({
  AnnouncementEmail: (props: unknown) => ({ type: 'AnnouncementEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/services/notification-digest-queue', () => ({
  enqueueDigestItems: enqueueDigestItemsMock,
}));

import { queueAnnouncementDelivery } from '../../src/lib/services/announcement-delivery';

/** selectFrom(users, …, inArray(users.id, ids)) served from `userRows`. */
function selectUsersFrom(userRows: Array<Record<string, unknown>>) {
  return vi.fn(async (table: unknown, _columns: unknown, where?: { col: unknown; vals: unknown[] }) => {
    if (table !== tables.users || where?.col !== tables.users.id) return [];
    return userRows.filter((row) => where.vals.includes(row['id']));
  });
}

/** Mirrors the scoped client's read guard: `users` is platform-global. */
function refuseUsersTable(table: unknown): void {
  if (table === tables.users) throw new Error('Unscoped query on table "users"');
}

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
          { userId: 'u-owner', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', designation: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } },
          { userId: 'u-board', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', designation: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } },
          { userId: 'u-tenant', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant' },
        ];
      }
      refuseUsersTable(table);
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

    const queryWhere = vi.fn().mockImplementation(async (table: unknown) => {
      if (table === tables.announcementDeliveryLog) {
        return deliveryRows.length > 0 ? [deliveryRows[0]] : [];
      }
      return [];
    });

    const selectFrom = selectUsersFrom([
      { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner' },
      { id: 'u-board', email: 'board@example.com', fullName: 'Board' },
      { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant' },
    ]);

    createScopedClientMock.mockReturnValue({
      query,
      queryWhere,
      selectFrom,
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
    // Only the audience members who have not opted out are read from users —
    // u-tenant is outside board_only (and opted out), so it is never loaded.
    expect(selectFrom.mock.calls.map(([, , where]) => where)).toEqual([
      { _type: 'inArray', col: tables.users.id, vals: ['u-owner', 'u-board'] },
    ]);
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
      refuseUsersTable(table);
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
      queryWhere: vi.fn().mockResolvedValue([]),
      selectFrom: selectUsersFrom(userRows),
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

  it('board_only targets designation, not presetKey (role-independent)', async () => {
    const roleRows = [
      // (a) canonical post-backfill shape: designation present, presetKey null
      { userId: 'u-pres', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: null, designation: 'board_president' },
      // (b) forward-looking: resident carrying a board designation must match
      { userId: 'u-res-board', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner', designation: 'board_member' },
      // (c) presetKey WITHOUT designation no longer matches
      { userId: 'u-preset-only', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', designation: null },
      // (d) plain manager: no designation, no preset
      { userId: 'u-plain-pm', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager' },
    ];
    const userRows = [
      { id: 'u-pres', email: 'pres@example.com', fullName: 'Pres' },
      { id: 'u-res-board', email: 'resboard@example.com', fullName: 'Res Board' },
      { id: 'u-preset-only', email: 'preset@example.com', fullName: 'Preset Only' },
      { id: 'u-plain-pm', email: 'pm@example.com', fullName: 'Plain PM' },
    ];

    const deliveryRows: Array<Record<string, unknown>> = [];
    const query = vi.fn(async (table: unknown) => {
      if (table === tables.userRoles) return roleRows;
      refuseUsersTable(table);
      if (table === tables.notificationPreferences) return [];
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
      queryWhere: vi.fn().mockResolvedValue([]),
      selectFrom: selectUsersFrom(userRows),
      insert,
      update: vi.fn().mockResolvedValue([]),
    });

    const count = await queueAnnouncementDelivery({
      communityId: 5,
      announcementId: 12,
      audience: 'board_only',
      title: 'Board Update',
      body: 'Body',
      isPinned: false,
      authorName: 'Admin',
    });

    expect(count).toBe(2);
    const sentTo = sendEmailMock.mock.calls.map(
      (call) => (call[0] as { to: string }).to,
    );
    expect(sentTo.sort()).toEqual(['pres@example.com', 'resboard@example.com']);
    expect(sentTo).not.toContain('preset@example.com');
    expect(sentTo).not.toContain('pm@example.com');
  });
});

describe('announcement email signature title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
  });

  function scopedWithRoles(roleRows: Array<Record<string, unknown>>) {
    const deliveryRows: Array<Record<string, unknown>> = [];
    createScopedClientMock.mockReturnValue({
      query: vi.fn(async (table: unknown) => {
        refuseUsersTable(table);
        if (table === tables.userRoles) return roleRows;
        if (table === tables.communities) return [{ id: 5, name: 'Sunset Condos' }];
        return [];
      }),
      queryWhere: vi.fn(async () => deliveryRows.slice(0, 1)),
      selectFrom: selectUsersFrom([{ id: 'u-reader', email: 'reader@example.com', fullName: 'Reader' }]),
      insert: vi.fn(async (_table: unknown, data: Record<string, unknown>) => {
        const row = { id: deliveryRows.length + 1, attemptCount: 0, ...data };
        deliveryRows.push(row);
        return [row];
      }),
      update: vi.fn().mockResolvedValue([]),
    });
  }

  async function sentProps(authorUserId: string | undefined) {
    await queueAnnouncementDelivery({
      communityId: 5,
      announcementId: 11,
      audience: 'all',
      title: 'Pool closure',
      body: 'Body',
      isPinned: false,
      authorName: 'Dana Ruiz',
      authorUserId,
    });
    const call = sendEmailMock.mock.calls[0]![0] as {
      category: string;
      react: { props: Record<string, unknown> };
    };
    return { category: call.category, props: call.react.props };
  }

  const reader = { userId: 'u-reader', role: 'resident', isUnitOwner: true, displayTitle: null, designation: null };

  it("uses the author's displayTitle in this community", async () => {
    scopedWithRoles([reader, { userId: 'u-author', role: 'property_manager', displayTitle: 'Community Manager', designation: null }]);
    const { category, props } = await sentProps('u-author');
    expect(category).toBe('non-transactional');
    expect(props['authorRole']).toBe('Community Manager');
  });

  it('falls back to the board designation when no displayTitle is set', async () => {
    scopedWithRoles([reader, { userId: 'u-author', role: 'resident', displayTitle: null, designation: 'board_president' }]);
    const { props } = await sentProps('u-author');
    expect(props['authorRole']).toBe('Board President');
  });

  it('invents no title for an author with neither (or no author id)', async () => {
    scopedWithRoles([reader, { userId: 'u-author', role: 'property_manager', displayTitle: null, designation: null }]);
    expect((await sentProps('u-author')).props['authorRole']).toBeUndefined();

    sendEmailMock.mockClear();
    scopedWithRoles([reader, { userId: 'u-author', role: 'resident', displayTitle: 'Treasurer', designation: 'board_member' }]);
    expect((await sentProps(undefined)).props['authorRole']).toBeUndefined();
  });
});
