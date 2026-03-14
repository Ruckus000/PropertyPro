/**
 * Unit tests for the compliance alert service (P2-41).
 *
 * Tests:
 * - Overdue items are detected correctly
 * - Items with linked documents are not flagged
 * - Notifications sent to community admins
 * - Returns correct counts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendEmailMock,
  logAuditEventMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  tables: {
    userRoles: Symbol('user_roles'),
    users: Symbol('users'),
    notificationPreferences: Symbol('notification_preferences'),
    communities: Symbol('communities'),
    complianceChecklistItems: Symbol('compliance_checklist_items'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  userRoles: tables.userRoles,
  users: tables.users,
  notificationPreferences: tables.notificationPreferences,
  communities: tables.communities,
  complianceChecklistItems: tables.complianceChecklistItems,
}));

vi.mock('@propertypro/email', () => ({
  MeetingNoticeEmail: (props: unknown) => ({ type: 'MeetingNoticeEmail', props }),
  MaintenanceUpdateEmail: (props: unknown) => ({ type: 'MaintenanceUpdateEmail', props }),
  ComplianceAlertEmail: (props: unknown) => ({ type: 'ComplianceAlertEmail', props }),
  DocumentPostedEmail: (props: unknown) => ({ type: 'DocumentPostedEmail', props }),
  sendEmail: sendEmailMock,
}));

import { checkAndAlertOverdueItems } from '../../src/lib/services/compliance-alert-service';

const COMMUNITY_ID = 5;
const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days from now

function setupMock(
  checklistRows: Array<Record<string, unknown>>,
) {
  const query = vi.fn(async (table: unknown) => {
    if (table === tables.complianceChecklistItems) return checklistRows;
    if (table === tables.userRoles) {
      return [{ userId: 'u-cam', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager', presetKey: 'cam', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } }];
    }
    if (table === tables.users) {
      return [{ id: 'u-cam', email: 'cam@example.com', fullName: 'CAM User', deletedAt: null }];
    }
    if (table === tables.notificationPreferences) return [];
    if (table === tables.communities) {
      return [{ id: COMMUNITY_ID, name: 'Palm Gardens Condo' }];
    }
    return [];
  });

  createScopedClientMock.mockReturnValue({ query });
}

describe('compliance-alert-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('detects overdue items (deadline in past, no document linked)', async () => {
    setupMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: null,
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(1);
    expect(result.notifiedCount).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('does not flag items with linked documents', async () => {
    setupMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: 42, // already has a linked document
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not flag items with future deadlines', async () => {
    setupMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: futureDate,
        documentId: null,
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('does not flag items with no deadline', async () => {
    setupMock([
      {
        title: 'Optional Document',
        description: 'No deadline set',
        deadline: null,
        documentId: null,
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('sends one alert per overdue item', async () => {
    setupMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: null,
        statuteReference: '§718.111(12)(a)',
      },
      {
        title: 'Meeting Minutes',
        description: 'Must post meeting minutes',
        deadline: pastDate,
        documentId: null,
        statuteReference: '§718.111(12)(b)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(2);
    // Each overdue item triggers notification to the 1 admin (cam)
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it('returns zero counts when no checklist items exist', async () => {
    setupMock([]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system');
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });
});
