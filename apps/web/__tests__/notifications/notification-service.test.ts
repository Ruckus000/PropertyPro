/**
 * Unit tests for the notification dispatch service (P2-41).
 *
 * Tests:
 * - Recipient filtering by role
 * - Notification preferences are respected (opt-out)
 * - Users with no preferences record get defaults (all enabled)
 * - Users with deletedAt set are excluded
 * - Audit logging on send
 * - Each event type renders correct email
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendEmailMock,
  logAuditEventMock,
  enqueueDigestItemsMock,
  insertNotificationsMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  enqueueDigestItemsMock: vi.fn().mockResolvedValue({ enqueued: 0, duplicates: 0 }),
  insertNotificationsMock: vi.fn(),
  tables: {
    userRoles: Symbol('user_roles'),
    // A real column identity, so a lookup's predicate can be asserted.
    users: { __table: 'users', id: Symbol('users.id'), email: Symbol('users.email'), fullName: Symbol('users.fullName') },
    notificationPreferences: Symbol('notification_preferences'),
    communities: Symbol('communities'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  insertNotifications: insertNotificationsMock,
  userRoles: tables.userRoles,
  users: tables.users,
  notificationPreferences: tables.notificationPreferences,
  communities: tables.communities,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
  isNull: (col: unknown) => ({ _type: 'isNull', col }),
  lt: (col: unknown, val: unknown) => ({ _type: 'lt', col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ _type: 'sql', strings, values }),
}));

vi.mock('@propertypro/email', () => ({
  MeetingNoticeEmail: (props: unknown) => ({ type: 'MeetingNoticeEmail', props }),
  MaintenanceUpdateEmail: (props: unknown) => ({ type: 'MaintenanceUpdateEmail', props }),
  ComplianceAlertEmail: (props: unknown) => ({ type: 'ComplianceAlertEmail', props }),
  DocumentPostedEmail: (props: unknown) => ({ type: 'DocumentPostedEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/services/notification-digest-queue', () => ({
  enqueueDigestItems: enqueueDigestItemsMock,
}));

import {
  createNotificationsForEvent,
  sendNotification,
  resolveRecipients,
} from '../../src/lib/services/notification-service';
import type {
  MeetingNoticeEvent,
  MaintenanceUpdateEvent,
  ComplianceAlertEvent,
  DocumentPostedEvent,
} from '../../src/lib/services/notification-service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 5;

const baseRoleRows = [
  { userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' },
  { userId: 'u-board', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', designation: 'board_member' },
  { userId: 'u-president', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', designation: 'board_president' },
  { userId: 'u-cam', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager' },
  { userId: 'u-tenant', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant' },
  { userId: 'u-site-mgr', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager' },
  { userId: 'u-pm-admin', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager Admin' },
];

const baseUserRows = [
  { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner User', deletedAt: null },
  { id: 'u-board', email: 'board@example.com', fullName: 'Board Member', deletedAt: null },
  { id: 'u-president', email: 'president@example.com', fullName: 'Board President', deletedAt: null },
  { id: 'u-cam', email: 'cam@example.com', fullName: 'CAM User', deletedAt: null },
  { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant User', deletedAt: null },
  { id: 'u-site-mgr', email: 'sitemgr@example.com', fullName: 'Site Manager', deletedAt: null },
  { id: 'u-pm-admin', email: 'pmadmin@example.com', fullName: 'PM Admin', deletedAt: null },
];

const communityRows = [{ id: COMMUNITY_ID, name: 'Palm Gardens Condo' }];

function setupMock(
  roleRows: Array<Record<string, unknown>> = baseRoleRows,
  userRows: Array<Record<string, unknown>> = baseUserRows,
  preferenceRows: Array<Record<string, unknown>> = [],
) {
  const query = vi.fn(async (table: unknown) => {
    if (table === tables.userRoles) return roleRows;
    // Mirrors the scoped client's read guard: `users` is platform-global.
    if (table === tables.users) throw new Error('Unscoped query on table "users"');
    if (table === tables.notificationPreferences) return preferenceRows;
    if (table === tables.communities) return communityRows;
    return [];
  });

  // selectFrom(users, …, eq|inArray on users.id). Like the real scoped client it
  // also drops soft-deleted rows, which is how deleted users are excluded.
  const selectFrom = vi.fn(
    async (table: unknown, _columns: unknown, where?: { _type: string; col: unknown; val?: unknown; vals?: unknown[] }) => {
      if (table !== tables.users || where?.col !== tables.users.id) return [];
      const ids = where._type === 'eq' ? [where.val] : (where.vals ?? []);
      return userRows.filter((row) => row['deletedAt'] == null && ids.includes(row['id']));
    },
  );

  createScopedClientMock.mockReturnValue({ query, selectFrom });
  return { query, selectFrom };
}

function userLookups(selectFrom: ReturnType<typeof vi.fn>) {
  return selectFrom.mock.calls.filter(([table]) => table === tables.users).map(([, , where]) => where);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notification-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    logAuditEventMock.mockResolvedValue(undefined);
    enqueueDigestItemsMock.mockResolvedValue({ enqueued: 0, duplicates: 0 });
  });

  // -------------------------------------------------------------------------
  // Recipient filtering
  // -------------------------------------------------------------------------

  describe('resolveRecipients', () => {
    it('returns all users for filter "all"', async () => {
      setupMock();
      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'meeting');
      expect(recipients).toHaveLength(7);
    });

    it('returns only owners for filter "owners_only"', async () => {
      setupMock();
      const recipients = await resolveRecipients(COMMUNITY_ID, 'owners_only', 'meeting');
      expect(recipients).toHaveLength(1);
      expect(recipients[0]?.email).toBe('owner@example.com');
    });

    it('returns only non-owner residents for filter "tenants_only"', async () => {
      // `tenants_only` had no branch here at all, and the announcements route
      // silently downgraded it to `all` — so a renters-only announcement put
      // its title AND body into the notification feed of every owner, board
      // member and manager in the community.
      setupMock();
      const recipients = await resolveRecipients(COMMUNITY_ID, 'tenants_only', 'announcement');
      expect(recipients.map((r) => r.email)).toEqual(['tenant@example.com']);
    });

    it('returns board members and president for filter "board_only"', async () => {
      setupMock();
      const recipients = await resolveRecipients(COMMUNITY_ID, 'board_only', 'meeting');
      expect(recipients).toHaveLength(2);
      const emails = recipients.map((r) => r.email).sort();
      expect(emails).toEqual(['board@example.com', 'president@example.com']);
    });

    // Phase 3.2: board_only sources from designation (role-independent).
    it('board_only matches a property_manager with a board designation and no preset', async () => {
      setupMock(
        [{ userId: 'u-pm-board', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: null, designation: 'board_president' }],
        [{ id: 'u-pm-board', email: 'pmboard@example.com', fullName: 'PM Board', deletedAt: null }],
      );
      const recipients = await resolveRecipients(COMMUNITY_ID, 'board_only', 'meeting');
      expect(recipients.map((r) => r.email)).toEqual(['pmboard@example.com']);
    });

    it('board_only matches a resident with a board designation (role-independent)', async () => {
      setupMock(
        [{ userId: 'u-res-board', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner', designation: 'board_member' }],
        [{ id: 'u-res-board', email: 'resboard@example.com', fullName: 'Resident Board', deletedAt: null }],
      );
      const recipients = await resolveRecipients(COMMUNITY_ID, 'board_only', 'meeting');
      expect(recipients.map((r) => r.email)).toEqual(['resboard@example.com']);
    });

    it('board_only does NOT match a board preset without a designation', async () => {
      setupMock(
        [{ userId: 'u-preset-only', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', designation: null }],
        [{ id: 'u-preset-only', email: 'presetonly@example.com', fullName: 'Preset Only', deletedAt: null }],
      );
      const recipients = await resolveRecipients(COMMUNITY_ID, 'board_only', 'meeting');
      expect(recipients).toHaveLength(0);
    });

    it('board_only does NOT match a plain property_manager', async () => {
      setupMock(
        [{ userId: 'u-plain-pm', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager' }],
        [{ id: 'u-plain-pm', email: 'plainpm@example.com', fullName: 'Plain PM', deletedAt: null }],
      );
      const recipients = await resolveRecipients(COMMUNITY_ID, 'board_only', 'meeting');
      expect(recipients).toHaveLength(0);
    });

    it('loads only the users who qualify, never the whole users table', async () => {
      const { selectFrom } = setupMock(baseRoleRows, baseUserRows, [
        { userId: 'u-tenant', emailFrequency: 'never' },
      ]);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'owners_only', 'meeting');

      expect(recipients.map((r) => r.userId)).toEqual(['u-owner']);
      expect(userLookups(selectFrom)).toEqual([
        { _type: 'inArray', col: tables.users.id, vals: ['u-owner'] },
      ]);
    });

    it('resolves a specific_user who holds no role row, by id alone', async () => {
      const { selectFrom } = setupMock(
        baseRoleRows,
        [...baseUserRows, { id: 'u-former', email: 'former@example.com', fullName: 'Former Resident', deletedAt: null }],
      );

      const recipients = await resolveRecipients(
        COMMUNITY_ID,
        { type: 'specific_user', userId: 'u-former' },
        'maintenance',
      );

      expect(recipients).toEqual([
        { userId: 'u-former', email: 'former@example.com', fullName: 'Former Resident' },
      ]);
      expect(userLookups(selectFrom)).toEqual([
        { _type: 'eq', col: tables.users.id, val: 'u-former' },
      ]);
    });

    it('returns admin roles for filter "community_admins"', async () => {
      setupMock();
      const recipients = await resolveRecipients(COMMUNITY_ID, 'community_admins', 'meeting');
      expect(recipients).toHaveLength(5);
      const emails = recipients.map((r) => r.email).sort();
      expect(emails).toEqual([
        'board@example.com',
        'cam@example.com',
        'pmadmin@example.com',
        'president@example.com',
        'sitemgr@example.com',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Notification preferences respected
  // -------------------------------------------------------------------------

  describe('preference opt-out', () => {
    it('excludes users who opted out of meeting notifications', async () => {
      setupMock(baseRoleRows, baseUserRows, [
        { userId: 'u-owner', emailFrequency: 'immediate', emailAnnouncements: true, emailMeetings: false, inAppEnabled: true },
        { userId: 'u-board', emailFrequency: 'immediate', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true },
      ]);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'meeting');
      const emails = recipients.map((r) => r.email);
      expect(emails).not.toContain('owner@example.com');
      expect(emails).toContain('board@example.com');
    });

    it('sends document notifications regardless of per-type toggles (no individual toggle)', async () => {
      setupMock(baseRoleRows, baseUserRows, [
        { userId: 'u-owner', emailFrequency: 'immediate', emailAnnouncements: false, emailMeetings: false, inAppEnabled: true },
      ]);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'document');
      const emails = recipients.map((r) => r.email);
      expect(emails).toContain('owner@example.com');
    });

    it('suppresses document notifications when frequency is never', async () => {
      setupMock(baseRoleRows, baseUserRows, [
        { userId: 'u-owner', emailFrequency: 'never', emailAnnouncements: true, emailMeetings: true, inAppEnabled: true },
      ]);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'document');
      const emails = recipients.map((r) => r.email);
      expect(emails).not.toContain('owner@example.com');
    });

    it('sends maintenance notifications regardless of per-type toggles (no individual toggle)', async () => {
      setupMock(baseRoleRows, baseUserRows, [
        { userId: 'u-tenant', emailFrequency: 'immediate', emailAnnouncements: false, emailMeetings: false, inAppEnabled: true },
      ]);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'maintenance');
      const emails = recipients.map((r) => r.email);
      expect(emails).toContain('tenant@example.com');
    });
  });

  // -------------------------------------------------------------------------
  // Default preferences (no record = all enabled)
  // -------------------------------------------------------------------------

  describe('default preferences', () => {
    it('includes users with no notification preferences record (defaults to all enabled)', async () => {
      setupMock(baseRoleRows, baseUserRows, []);

      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'meeting');
      expect(recipients).toHaveLength(7);
    });
  });

  // -------------------------------------------------------------------------
  // Deleted/unverified users excluded
  // -------------------------------------------------------------------------

  describe('deleted users', () => {
    it('excludes users with deletedAt set', async () => {
      const usersWithDeleted = [
        ...baseUserRows,
        { id: 'u-deleted', email: 'deleted@example.com', fullName: 'Deleted User', deletedAt: new Date() },
      ];
      const rolesWithDeleted = [
        ...baseRoleRows,
        { userId: 'u-deleted', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' },
      ];

      setupMock(rolesWithDeleted, usersWithDeleted, []);
      const recipients = await resolveRecipients(COMMUNITY_ID, 'all', 'meeting');
      const emails = recipients.map((r) => r.email);
      expect(emails).not.toContain('deleted@example.com');
    });
  });

  // -------------------------------------------------------------------------
  // sendNotification — event dispatch
  // -------------------------------------------------------------------------

  describe('sendNotification', () => {
    it('sends meeting notice emails and returns count', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [],
      );

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Annual Budget Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'owner',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: expect.stringContaining('Meeting Notice'),
          category: 'non-transactional',
          unsubscribeUrl: expect.any(String),
        }),
      );
    });

    it('sends maintenance update emails', async () => {
      setupMock(
        [{ userId: 'u-tenant', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant' }],
        [{ id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant', deletedAt: null }],
        [],
      );

      const event: MaintenanceUpdateEvent = {
        type: 'maintenance_update',
        requestTitle: 'Leaky Faucet',
        previousStatus: 'open',
        newStatus: 'in_progress',
        requestId: '42',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Update on your maintenance request'),
        }),
      );

      // Deep-link must target the Operations hub — the legacy /maintenance/[id]
      // detail route no longer exists.
      const emailArgs = sendEmailMock.mock.calls[0]![0] as {
        react: { props: { portalUrl: string } };
      };
      expect(emailArgs.react.props.portalUrl).toContain(
        `/communities/${COMMUNITY_ID}/operations?tab=requests`,
      );
    });

    it('sends compliance alert emails', async () => {
      setupMock(
        [{ userId: 'u-cam', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager' }],
        [{ id: 'u-cam', email: 'cam@example.com', fullName: 'CAM User', deletedAt: null }],
        [],
      );

      const event: ComplianceAlertEvent = {
        type: 'compliance_alert',
        alertTitle: 'Missing Financial Report',
        alertDescription: 'Q4 report not posted.',
        severity: 'critical',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'community_admins', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Action Required'),
        }),
      );
    });

    it('sends document posted emails', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [],
      );

      const event: DocumentPostedEvent = {
        type: 'document_posted',
        documentTitle: 'Q4 2025 Financial Report',
        uploadedByName: 'Board Treasurer',
        documentId: '99',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('New document posted'),
        }),
      );
    });

    it('returns 0 when no eligible recipients', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [{ userId: 'u-owner', emailFrequency: 'immediate', emailAnnouncements: true, emailMeetings: false, inAppEnabled: true }],
      );

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Board Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'board',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(0);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('queues digest rows instead of sending immediate emails for digest frequency', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [
          {
            userId: 'u-owner',
            emailFrequency: 'daily_digest',
            emailAnnouncements: true,
            emailMeetings: true,
            inAppEnabled: true,
          },
        ],
      );

      enqueueDigestItemsMock.mockResolvedValueOnce({ enqueued: 1, duplicates: 0 });

      const event: DocumentPostedEvent = {
        type: 'document_posted',
        documentTitle: 'Q4 2025 Financial Report',
        uploadedByName: 'Board Treasurer',
        documentId: '99',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(enqueueDigestItemsMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'u-owner',
            frequency: 'daily_digest',
            sourceType: 'document',
            sourceId: '99',
          }),
        ]),
      );
    });

    it('suppresses non-critical notifications for frequency=never', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [
          {
            userId: 'u-owner',
            emailFrequency: 'never',
            emailAnnouncements: true,
            emailMeetings: true,
            inAppEnabled: true,
          },
        ],
      );

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Board Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'board',
        sourceType: 'meeting',
        sourceId: 'meeting-1',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');
      expect(count).toBe(0);
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(enqueueDigestItemsMock).not.toHaveBeenCalled();
    });

    it('falls back to immediate when digest preference exists but event has no sourceId', async () => {
      setupMock(
        [{ userId: 'u-cam', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager' }],
        [{ id: 'u-cam', email: 'cam@example.com', fullName: 'CAM User', deletedAt: null }],
        [
          {
            userId: 'u-cam',
            emailFrequency: 'daily_digest',
            emailAnnouncements: true,
            emailMeetings: true,
            inAppEnabled: true,
          },
        ],
      );

      const event: ComplianceAlertEvent = {
        type: 'compliance_alert',
        alertTitle: 'Missing Financial Report',
        alertDescription: 'Q4 report not posted.',
        severity: 'critical',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'community_admins', 'actor-1');
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(enqueueDigestItemsMock).not.toHaveBeenCalled();
    });

    it('logs audit event with notification_sent action after sending', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [],
      );

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Board Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'board',
      };

      await sendNotification(COMMUNITY_ID, event, 'all', 'actor-1');

      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'notification_sent',
          resourceType: 'meeting_notice',
          communityId: COMMUNITY_ID,
          metadata: expect.objectContaining({
            eventType: 'meeting_notice',
            recipientFilter: 'all',
            recipientCount: 1,
            sentCount: 1,
          }),
        }),
      );
    });

    it('does not log audit event when no actorUserId provided', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [],
      );

      const event: DocumentPostedEvent = {
        type: 'document_posted',
        documentTitle: 'Report',
        uploadedByName: 'Admin',
        documentId: '1',
      };

      await sendNotification(COMMUNITY_ID, event, 'all');
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it('includes List-Unsubscribe by passing non-transactional category', async () => {
      setupMock(
        [{ userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' }],
        [{ id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null }],
        [],
      );

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Board Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'board',
      };

      await sendNotification(COMMUNITY_ID, event, 'all');

      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'non-transactional',
          unsubscribeUrl: expect.stringContaining('/settings?communityId='),
        }),
      );
    });

    it('continues sending when one email fails', async () => {
      setupMock(
        [
          { userId: 'u-owner', role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner' },
          { userId: 'u-board', role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', designation: 'board_member' },
        ],
        [
          { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null },
          { id: 'u-board', email: 'board@example.com', fullName: 'Board', deletedAt: null },
        ],
        [],
      );

      // First call fails, second succeeds
      sendEmailMock
        .mockRejectedValueOnce(new Error('Resend rate limit'))
        .mockResolvedValueOnce({ id: 'msg-2' });

      const event: MeetingNoticeEvent = {
        type: 'meeting_notice',
        meetingTitle: 'Board Meeting',
        meetingDate: 'March 15, 2026',
        meetingTime: '7:00 PM EST',
        location: 'Clubhouse',
        meetingType: 'board',
      };

      const count = await sendNotification(COMMUNITY_ID, event, 'all');
      // One succeeded, one failed
      expect(count).toBe(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // createNotificationsForEvent — in-app channel
  // -------------------------------------------------------------------------

  describe('createNotificationsForEvent', () => {
    const inAppEvent = {
      category: 'announcement' as const,
      title: 'Pool closed',
      sourceType: 'announcement',
      sourceId: '1',
    };

    beforeEach(() => {
      insertNotificationsMock.mockImplementation(async (rows: unknown[]) => ({ created: rows.length }));
    });

    // This path swallows recipient-resolution errors (logs, returns created: 0),
    // so a read the scoped client refuses would silently stop in-app delivery.
    it('notifies live matched users, reading only their ids from users', async () => {
      const { selectFrom } = setupMock(
        [
          { userId: 'u-owner', role: 'resident', isUnitOwner: true },
          { userId: 'u-tenant', role: 'resident', isUnitOwner: false },
          { userId: 'u-gone', role: 'resident', isUnitOwner: true },
        ],
        [
          { id: 'u-owner', email: 'owner@example.com', fullName: 'Owner', deletedAt: null },
          { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Tenant', deletedAt: null },
          { id: 'u-gone', email: 'gone@example.com', fullName: 'Gone', deletedAt: new Date() },
        ],
      );

      const result = await createNotificationsForEvent(COMMUNITY_ID, inAppEvent, 'owners_only');

      expect(result).toEqual({ created: 1, skipped: 0 });
      expect(insertNotificationsMock).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'u-owner', title: 'Pool closed' }),
      ]);
      expect(userLookups(selectFrom)).toEqual([
        { _type: 'inArray', col: tables.users.id, vals: ['u-owner', 'u-gone'] },
      ]);
    });

    it('notifies a specific_user who holds no role row', async () => {
      const { selectFrom } = setupMock(
        [],
        [{ id: 'u-submitter', email: 's@example.com', fullName: 'Submitter', deletedAt: null }],
      );

      const result = await createNotificationsForEvent(
        COMMUNITY_ID,
        inAppEvent,
        { type: 'specific_user', userId: 'u-submitter' },
      );

      expect(result).toEqual({ created: 1, skipped: 0 });
      expect(userLookups(selectFrom)).toEqual([
        { _type: 'inArray', col: tables.users.id, vals: ['u-submitter'] },
      ]);
    });
  });
});
