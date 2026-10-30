/**
 * "Email owners" must not reach tenants.
 *
 * `site-publish-notification.test.ts` pins that `audience` is passed to each
 * place that picks recipients. This file goes one step further and runs the REAL
 * email recipient query (`announcement-delivery`) behind the notifier, so what is
 * asserted is who actually receives mail: an owner does, a tenant (a resident
 * who is not a unit owner), a manager and a board-designated tenant do not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendEmailMock,
  createAnnouncementMock,
  createNotificationsMock,
  logAuditEventMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  createAnnouncementMock: vi.fn(),
  createNotificationsMock: vi.fn(),
  logAuditEventMock: vi.fn(),
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
  logAuditEvent: logAuditEventMock,
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
  sendBulkEmail: vi.fn(async (requests: unknown[]) => {
    for (const request of requests) await sendEmailMock(request);
    return {
      results: requests.map(() => ({ success: true, id: 'msg-1' })),
      successCount: requests.length,
      failureCount: 0,
    };
  }),
}));
vi.mock('@/lib/services/notification-digest-queue', () => ({
  enqueueDigestItems: vi.fn().mockResolvedValue({ enqueued: 0, duplicates: 0 }),
}));
vi.mock('@/lib/services/announcement-service', () => ({
  createAnnouncementForCommunity: createAnnouncementMock,
  getAnnouncementAuthorName: vi.fn().mockResolvedValue('Dana Reyes'),
}));
vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: createNotificationsMock,
}));
vi.mock('@/lib/utils/html-sanitizer', () => ({ sanitizeHtml: (html: string) => html }));

import { notifyResidentsOfSitePublish } from '@/lib/services/site-publish-notification';

const ROLE_ROWS = [
  { userId: 'u-owner', role: 'resident', isUnitOwner: true, designation: null },
  { userId: 'u-tenant', role: 'resident', isUnitOwner: false, designation: null },
  { userId: 'u-board-tenant', role: 'resident', isUnitOwner: false, designation: 'board_member' },
  { userId: 'u-manager', role: 'property_manager', isUnitOwner: false, designation: null },
];
const USER_ROWS = [
  { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner' },
  { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant' },
  { id: 'u-board-tenant', email: 'board-tenant@example.com', fullName: 'Board Tenant' },
  { id: 'u-manager', email: 'manager@example.com', fullName: 'Manager' },
];

function mailedTo(): string[] {
  return sendEmailMock.mock.calls.map(([payload]) => (payload as { to: string }).to);
}

beforeEach(() => {
  vi.clearAllMocks();
  const deliveryRows: Array<Record<string, unknown>> = [];
  createAnnouncementMock.mockResolvedValue({ id: 7 });
  createNotificationsMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  createScopedClientMock.mockReturnValue({
    query: vi.fn(async (table: unknown) => {
      if (table === tables.userRoles) return ROLE_ROWS;
      if (table === tables.notificationPreferences) return [];
      if (table === tables.communities) return [{ id: 42, name: 'Sunset Condos', slug: 'sunset-condos' }];
      return [];
    }),
    queryWhere: vi.fn(async () => (deliveryRows.length > 0 ? [deliveryRows[0]] : [])),
    selectFrom: vi.fn(async (_table: unknown, _columns: unknown, where?: { vals: string[] }) =>
      USER_ROWS.filter((row) => where?.vals.includes(row.id)),
    ),
    insert: vi.fn(async (table: unknown, data: Record<string, unknown>) => {
      if (table !== tables.announcementDeliveryLog) return [];
      const row = { id: deliveryRows.length + 1, attemptCount: 0, ...data };
      deliveryRows.push(row);
      return [row];
    }),
    update: vi.fn().mockResolvedValue([]),
  });
});

describe('notifyResidentsOfSitePublish — who is emailed', () => {
  it('owners_only emails the owner and no tenant, board tenant or manager', async () => {
    const result = await notifyResidentsOfSitePublish({
      communityId: 42,
      actorUserId: 'user-1',
      summary: 'Our community website is live',
      audience: 'owners_only',
    });

    expect(result).toEqual({ status: 'sent', announcementId: 7, recipientCount: 1 });
    expect(mailedTo()).toEqual(['owner@example.com']);
    expect(mailedTo()).not.toContain('tenant@example.com');
  });

  it('control: the default audience still emails every resident and manager', async () => {
    await notifyResidentsOfSitePublish({
      communityId: 42,
      actorUserId: 'user-1',
      summary: 'Pool hours updated',
    });

    expect(mailedTo().sort()).toEqual([
      'board-tenant@example.com',
      'manager@example.com',
      'owner@example.com',
      'tenant@example.com',
    ]);
  });
});
