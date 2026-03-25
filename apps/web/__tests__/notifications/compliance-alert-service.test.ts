/**
 * Unit tests for the compliance alert service.
 *
 * Tests:
 * - Overdue detection via calculateComplianceStatus (not manual deadline check)
 * - N/A items excluded from overdue count
 * - Rolling-window items with stale/fresh documents
 * - Single digest notification per community (not one per item)
 * - processComplianceAlerts cross-community iteration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendNotificationMock,
  createUnscopedClientMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  tables: {
    communities: Symbol('communities'),
    complianceChecklistItems: Symbol('compliance_checklist_items'),
    visitorLog: Symbol('visitor_log'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  communities: tables.communities,
  complianceChecklistItems: tables.complianceChecklistItems,
  visitorLog: tables.visitorLog,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(() => 'and_placeholder'),
  gte: vi.fn(() => 'gte_placeholder'),
  inArray: vi.fn(() => 'inArray_placeholder'),
  isNull: vi.fn(() => 'isNull_placeholder'),
  lte: vi.fn(() => 'lte_placeholder'),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  sendNotification: sendNotificationMock,
}));

import {
  checkAndAlertOverdueItems,
  processComplianceAlerts,
} from '../../src/lib/services/compliance-alert-service';

const COMMUNITY_ID = 5;
const NOW = new Date('2026-03-15T12:00:00.000Z');
const pastDate = new Date('2026-02-01T00:00:00.000Z').toISOString();
const futureDate = new Date('2026-04-15T00:00:00.000Z').toISOString();

function setupChecklistMock(rows: Array<Record<string, unknown>>) {
  createScopedClientMock.mockReturnValue({
    query: vi.fn(async () => rows),
  });
}

describe('checkAndAlertOverdueItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(1);
  });

  it('detects overdue items (deadline in past, no document linked)', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(1);
    expect(result.notifiedCount).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('does not flag items with linked documents', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: 42,
        documentPostedAt: new Date('2026-02-10T00:00:00.000Z').toISOString(),
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('does not flag items with future deadlines', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: futureDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('does not flag items with no deadline and no rolling window', async () => {
    setupChecklistMock([
      {
        title: 'Optional Document',
        description: 'No deadline set',
        deadline: null,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('returns zero counts when no checklist items exist', async () => {
    setupChecklistMock([]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  // Bug 1 fix: N/A items must be excluded
  it('excludes items marked not applicable from overdue count', async () => {
    setupChecklistMock([
      {
        title: 'SIRS Report',
        description: 'Structural integrity reserve study',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: false,
        statuteReference: '§718.112(2)(g)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // Bug 2 fix: Rolling-window items with stale documents
  it('counts rolling-window item with stale document as overdue', async () => {
    setupChecklistMock([
      {
        title: 'Meeting Minutes',
        description: 'Rolling 12-month minutes',
        deadline: null,
        documentId: 100,
        documentPostedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(), // 14+ months ago
        rollingWindow: { months: 12 },
        isApplicable: true,
        statuteReference: '§718.111(12)(g)(2)(e)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  // Bug 2 fix: Rolling-window items with fresh documents
  it('does not count rolling-window item with fresh document as overdue', async () => {
    setupChecklistMock([
      {
        title: 'Meeting Minutes',
        description: 'Rolling 12-month minutes',
        deadline: null,
        documentId: 100,
        documentPostedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(), // 2.5 months ago
        rollingWindow: { months: 12 },
        isApplicable: true,
        statuteReference: '§718.111(12)(g)(2)(e)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // Spam fix: Single digest per community
  it('sends single digest notification for multiple overdue items', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Budget posting',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
      {
        title: 'Financial Report',
        description: 'Annual report',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(13)',
      },
      {
        title: 'Insurance Policies',
        description: 'Current policies',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(11)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(3);
    // Single digest — NOT 3 separate calls
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  // Digest event includes sourceId and sourceType for proper routing
  it('digest event includes sourceId and sourceType', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Budget posting',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({
        type: 'compliance_alert',
        sourceType: 'compliance',
        sourceId: String(COMMUNITY_ID),
      }),
      'community_admins',
      'system',
    );
  });
});

describe('processComplianceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(1);
  });

  function setupUnscopedMock(
    communityRows: Array<{ id: number; communityType: string; timezone: string }>,
    visitorRows: Array<Record<string, unknown>> = [],
  ) {
    createUnscopedClientMock.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn().mockResolvedValue(
            table === tables.communities ? communityRows : visitorRows,
          ),
        })),
      })),
    });
  }

  it('iterates only condo/HOA communities, skips apartments', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718', timezone: 'America/New_York' },
      { id: 2, communityType: 'hoa_720', timezone: 'America/Chicago' },
      { id: 3, communityType: 'apartment', timezone: 'America/New_York' },
    ]);

    // Each compliance community returns 0 overdue items
    createScopedClientMock.mockReturnValue({
      query: vi.fn(async () => []),
    });

    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(2);
    expect(summary.errors).toBe(0);
    // Scoped client should be created for communities 1 and 2 only
    expect(createScopedClientMock).toHaveBeenCalledWith(1);
    expect(createScopedClientMock).toHaveBeenCalledWith(2);
    expect(createScopedClientMock).not.toHaveBeenCalledWith(3);
  });

  it('continues processing if one community throws', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718', timezone: 'America/New_York' },
      { id: 2, communityType: 'condo_718', timezone: 'America/New_York' },
    ]);

    let callCount = 0;
    createScopedClientMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          query: vi.fn(async () => { throw new Error('DB connection failed'); }),
        };
      }
      return {
        query: vi.fn(async () => []),
      };
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(1);
    expect(summary.errors).toBe(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('aggregates totals across communities', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718', timezone: 'America/New_York' },
      { id: 2, communityType: 'hoa_720', timezone: 'America/Chicago' },
    ]);

    let callCount = 0;
    createScopedClientMock.mockImplementation(() => {
      callCount++;
      return {
        query: vi.fn(async () => {
          if (callCount === 1) {
            // Community 1: 3 overdue items
            return [
              { title: 'Budget', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.112(2)(f)' },
              { title: 'Report', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.111(13)' },
              { title: 'Insurance', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.111(11)' },
            ];
          }
          // Community 2: 2 overdue items
          return [
            { title: 'Covenants', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§720.303(4)' },
            { title: 'HOA Budget', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§720.303(6)' },
          ];
        }),
      };
    });

    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(2);
    expect(summary.totalOverdue).toBe(5);
    expect(summary.errors).toBe(0);
  });

  it('sends immediate visitor-expiry notifications for expiring passes', async () => {
    setupUnscopedMock(
      [{ id: 1, communityType: 'condo_718', timezone: 'America/New_York' }],
      [{
        communityId: 1,
        id: 77,
        visitorName: 'Casey Guest',
        guestType: 'recurring',
        hostUserId: 'resident-1',
        validUntil: new Date('2026-03-20T16:30:00.000Z'),
      }],
    );

    createScopedClientMock.mockReturnValue({
      query: vi.fn(async () => []),
    });

    const summary = await processComplianceAlerts(NOW);

    expect(summary.communitiesProcessed).toBe(1);
    expect(summary.totalExpiringVisitors).toBe(1);
    expect(summary.totalExpiryNotifications).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: 'compliance_alert',
        alertTitle: 'Casey Guest visitor pass expires soon',
        severity: 'warning',
      }),
      { type: 'specific_user', userId: 'resident-1' },
      undefined,
    );

    const event = sendNotificationMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(event).toBeDefined();
    expect('sourceId' in event).toBe(false);
  });
});
