/**
 * Scheduled ("send later") emergency alerts — the per-community half:
 * scheduling, cancelling, the send refusal, and what residents may see.
 *
 * The cron is covered in `scheduled-broadcast-job.test.ts`; the SQL that makes
 * claim and cancel atomic is proven against Postgres in
 * `integration/scheduled-emergency-broadcasts.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, logAuditEventMock, sendBulkEmailMock, sendBulkEmergencySmsMock, tables } =
  vi.hoisted(() => ({
    createScopedClientMock: vi.fn(),
    logAuditEventMock: vi.fn(),
    sendBulkEmailMock: vi.fn(),
    sendBulkEmergencySmsMock: vi.fn(),
    tables: {
      communities: { __table: 'communities', id: 'communities.id' },
      emergencyBroadcastRecipients: {
        __table: 'recipients',
        broadcastId: 'recipients.broadcastId',
        userId: 'recipients.userId',
      },
      emergencyBroadcasts: {
        __table: 'broadcasts',
        id: 'broadcasts.id',
        completedAt: 'broadcasts.completedAt',
        canceledAt: 'broadcasts.canceledAt',
        sendClaimedAt: 'broadcasts.sendClaimedAt',
        sendOutcome: 'broadcasts.sendOutcome',
      },
      notificationPreferences: { __table: 'prefs' },
      userRoles: { __table: 'roles' },
      users: { __table: 'users', id: 'users.id' },
    },
  }));

vi.mock('@propertypro/db', () => ({
  ...tables,
  clampPageSize: (n?: number) => n ?? 50,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  paginate: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  desc: (col: unknown) => ({ __desc: col }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: [col, vals] }),
  isNull: (col: unknown) => ({ __isNull: col }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
}));

vi.mock('@propertypro/email', () => ({
  EmergencyAlertEmail: vi.fn(),
  sendBulkEmail: sendBulkEmailMock,
}));

vi.mock('@/lib/services/sms/sms-service', () => ({
  sendBulkEmergencySms: sendBulkEmergencySmsMock,
}));

import {
  assertSchedulableTime,
  cancelBroadcast,
  createBroadcast,
  executeBroadcast,
  getBroadcastForRecipient,
  getBroadcastWithReport,
  listBroadcastsForRecipient,
} from '../../src/lib/services/emergency-broadcast-service';
import { ConflictError, ValidationError } from '../../src/lib/api/errors';

const NOW = new Date('2026-11-23T15:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const baseParams = {
  communityId: 42,
  title: 'Water off tomorrow',
  body: 'Water will be off 9 to noon.',
  severity: 'info' as const,
  targetAudience: 'all' as const,
  channels: ['sms', 'email'] as Array<'sms' | 'email'>,
  smsAllowed: false,
  initiatedBy: 'manager-1',
};

/** A scoped client whose community has one owner with an email address. */
function mockScoped(broadcastRow?: Record<string, unknown>, recipientRows: Record<string, unknown>[] = []) {
  const inserts: Array<{ table: unknown; data: unknown }> = [];
  const updates: Array<{ table: unknown; data: Record<string, unknown>; where: unknown }> = [];
  let updateResult: unknown[] = [{ id: 7 }];
  const selectFrom = vi.fn((table: unknown, _columns?: unknown, _where?: unknown) => {
    if (table === tables.userRoles) return Promise.resolve([{ userId: 'u1', role: 'resident', isUnitOwner: true }]);
    if (table === tables.users) {
      return Promise.resolve([
        { id: 'u1', email: 'owner@example.com', fullName: 'Owner One', phone: null, phoneVerifiedAt: null },
      ]);
    }
    if (table === tables.emergencyBroadcasts) return Promise.resolve(broadcastRow ? [broadcastRow] : []);
    if (table === tables.emergencyBroadcastRecipients) return Promise.resolve(recipientRows);
    if (table === tables.communities) return Promise.resolve([{ name: 'Sunset Condos' }]);
    return Promise.resolve([]);
  });
  const scoped = {
    selectFrom,
    insert: vi.fn(async (table: unknown, data: unknown) => {
      inserts.push({ table, data });
      return table === tables.emergencyBroadcasts ? [{ id: 501 }] : [];
    }),
    update: vi.fn(async (table: unknown, data: Record<string, unknown>, where: unknown) => {
      updates.push({ table, data, where });
      return updateResult;
    }),
  };
  createScopedClientMock.mockReturnValue(scoped);
  return {
    scoped,
    inserts,
    updates,
    setUpdateResult: (rows: unknown[]) => {
      updateResult = rows;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  logAuditEventMock.mockResolvedValue(undefined);
  sendBulkEmailMock.mockResolvedValue({ successCount: 1, results: [{ success: true, id: 'e1' }] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('assertSchedulableTime — 5 minutes to 365 days ahead', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms);

  it('refuses 4m59s ahead, naming the field', () => {
    let thrown: unknown;
    try {
      assertSchedulableTime(at(5 * MINUTE - 1000), NOW);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).details).toEqual({
      fields: [{ field: 'scheduledFor', message: 'Must be at least 5 minutes from now.' }],
    });
  });

  it('accepts exactly 5 minutes ahead', () => {
    expect(() => assertSchedulableTime(at(5 * MINUTE), NOW)).not.toThrow();
  });

  it('accepts exactly 365 days ahead', () => {
    expect(() => assertSchedulableTime(at(365 * DAY), NOW)).not.toThrow();
  });

  it('refuses 365 days and 1 minute ahead, naming the field', () => {
    let thrown: unknown;
    try {
      assertSchedulableTime(at(365 * DAY + MINUTE), NOW);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).details).toEqual({
      fields: [{ field: 'scheduledFor', message: 'Must be within the next 365 days.' }],
    });
  });

  it('refuses an unparseable date', () => {
    expect(() => assertSchedulableTime(new Date('nonsense'), NOW)).toThrow(ValidationError);
  });
});

describe('createBroadcast', () => {
  it('schedules: stores scheduledFor, writes NO recipient rows, counts recipients as of now', async () => {
    const { inserts } = mockScoped();
    const scheduledFor = new Date(NOW.getTime() + 60 * MINUTE);

    const result = await createBroadcast({ ...baseParams, scheduledFor });

    expect(result).toEqual({
      broadcastId: 501,
      recipientCount: 1,
      smsEligibleCount: 0,
      emailCount: 1,
      scheduledFor: scheduledFor.toISOString(),
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(tables.emergencyBroadcasts);
    expect(inserts[0]?.data).toMatchObject({ scheduledFor, recipientCount: 1 });
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'manager-1',
        action: 'emergency_broadcast_scheduled',
        resourceId: '501',
        communityId: 42,
      }),
    );
    // The audit row names the alert and its time, never the message body.
    const metadata = logAuditEventMock.mock.calls[0]?.[0].metadata as Record<string, unknown>;
    expect(metadata['scheduledFor']).toBe(scheduledFor.toISOString());
    expect(JSON.stringify(metadata)).not.toContain(baseParams.body);
  });

  it('refuses a time under 5 minutes ahead before writing anything', async () => {
    const { inserts } = mockScoped();

    await expect(
      createBroadcast({ ...baseParams, scheduledFor: new Date(NOW.getTime() + 4 * MINUTE) }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(inserts).toHaveLength(0);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('without scheduledFor is unchanged: recipient rows written, no scheduling fields anywhere', async () => {
    const { inserts } = mockScoped();

    const result = await createBroadcast(baseParams);

    // toEqual, so an added `scheduledFor: undefined`-free key would still fail on a real value.
    expect(result).toEqual({ broadcastId: 501, recipientCount: 1, smsEligibleCount: 0, emailCount: 1 });
    expect(Object.keys(result)).toEqual(['broadcastId', 'recipientCount', 'smsEligibleCount', 'emailCount']);
    expect(inserts.map((i) => i.table)).toEqual([tables.emergencyBroadcasts, tables.emergencyBroadcastRecipients]);
    expect(inserts[0]?.data).not.toHaveProperty('scheduledFor');
    expect(inserts[1]?.data).toEqual([
      {
        broadcastId: 501,
        userId: 'u1',
        email: 'owner@example.com',
        phone: null,
        smsStatus: 'skipped',
        emailStatus: 'pending',
      },
    ]);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'emergency_broadcast_created' }),
    );
    expect(logAuditEventMock.mock.calls[0]?.[0].metadata).not.toHaveProperty('scheduledFor');
  });
});

describe('cancelBroadcast', () => {
  const scheduled = {
    id: 7,
    scheduledFor: new Date(NOW.getTime() + 3 * DAY),
    // Scheduled two days ago: far outside the 10-second undo window.
    initiatedAt: new Date(NOW.getTime() - 2 * DAY),
    canceledAt: null,
    completedAt: null,
  };

  it('cancels a scheduled broadcast long after the undo window, in one claim-guarded UPDATE', async () => {
    const { updates } = mockScoped(scheduled);

    await expect(cancelBroadcast(7, 42, 'manager-1')).resolves.toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toEqual({ canceledAt: NOW });
    expect(updates[0]?.where).toEqual({
      __and: [
        { __eq: ['broadcasts.id', 7] },
        { __isNull: 'broadcasts.sendClaimedAt' },
        { __isNull: 'broadcasts.canceledAt' },
        { __isNull: 'broadcasts.sendOutcome' },
      ],
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'manager-1', action: 'emergency_broadcast_canceled', resourceId: '7' }),
    );
  });

  it('loses when the job claimed first: the UPDATE matches no row, so false and no audit entry', async () => {
    const { setUpdateResult } = mockScoped(scheduled);
    setUpdateResult([]);

    await expect(cancelBroadcast(7, 42, 'manager-1')).resolves.toBe(false);

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('immediate broadcast: still cancellable inside the 10-second undo window', async () => {
    const { updates } = mockScoped({
      id: 7,
      scheduledFor: null,
      initiatedAt: new Date(NOW.getTime() - 9_000),
      canceledAt: null,
      completedAt: null,
    });

    await expect(cancelBroadcast(7, 42, 'manager-1')).resolves.toBe(true);

    // The unconditional immediate-path UPDATE, not the claim-guarded one.
    expect(updates[0]?.where).toEqual({ __eq: ['broadcasts.id', 7] });
  });

  it('immediate broadcast: refused after the undo window, with no write', async () => {
    const { updates } = mockScoped({
      id: 7,
      scheduledFor: null,
      initiatedAt: new Date(NOW.getTime() - 11_000),
      canceledAt: null,
      completedAt: null,
    });

    await expect(cancelBroadcast(7, 42, 'manager-1')).resolves.toBe(false);

    expect(updates).toHaveLength(0);
  });
});

describe('executeBroadcast', () => {
  const scheduledRow = {
    id: 7,
    title: 'Water off tomorrow',
    body: 'Water will be off 9 to noon.',
    smsBody: null,
    severity: 'info',
    scheduledFor: new Date(NOW.getTime() - MINUTE),
    canceledAt: null,
    completedAt: null,
  };
  const recipient = {
    broadcastId: 7,
    userId: 'u1',
    email: 'owner@example.com',
    phone: null,
    smsStatus: 'skipped',
    emailStatus: 'pending',
  };

  it('refuses a scheduled broadcast when a manager sends it — even one the job has claimed', async () => {
    for (const sendClaimedAt of [null, NOW]) {
      mockScoped({ ...scheduledRow, sendClaimedAt }, [recipient]);

      await expect(executeBroadcast(7, 42, 'manager-1')).rejects.toBeInstanceOf(ConflictError);
    }
    expect(sendBulkEmailMock).not.toHaveBeenCalled();
    expect(sendBulkEmergencySmsMock).not.toHaveBeenCalled();
  });

  it("sends for the job, with a system-actor audit entry naming the scheduler", async () => {
    mockScoped({ ...scheduledRow, sendClaimedAt: NOW }, [recipient]);

    await expect(executeBroadcast(7, 42, null, { scheduledBy: 'manager-1' })).resolves.toEqual({
      smsQueued: 0,
      emailSent: 1,
    });

    expect(sendBulkEmailMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: null,
      action: 'emergency_broadcast_sent',
      resourceType: 'emergency_broadcast',
      resourceId: '7',
      communityId: 42,
      metadata: {
        smsQueued: 0,
        emailSent: 1,
        totalRecipients: 1,
        scheduledBy: 'manager-1',
        scheduledFor: scheduledRow.scheduledFor.toISOString(),
      },
    });
  });
});

describe('what a resident may see', () => {
  it('a scheduled or missed broadcast has no recipient rows, so it is invisible', async () => {
    mockScoped({ id: 7, scheduledFor: new Date(NOW.getTime() + DAY), completedAt: null }, []);

    await expect(getBroadcastForRecipient(7, 42, 'u1')).resolves.toBeNull();
    await expect(listBroadcastsForRecipient(42, 'u1')).resolves.toEqual([]);
  });

  it('with a recipient row (a failed send), the read still requires completedAt and no cancel', async () => {
    const { scoped } = mockScoped(undefined, [{ broadcastId: 7 }]);

    await getBroadcastForRecipient(7, 42, 'u1');

    const broadcastRead = scoped.selectFrom.mock.calls.find(([table]) => table === tables.emergencyBroadcasts);
    expect(broadcastRead?.[2]).toEqual({
      __and: [
        { __eq: ['broadcasts.id', 7] },
        {
          __and: [
            { __inArray: ['broadcasts.id', [7]] },
            { __isNotNull: 'broadcasts.completedAt' },
            { __isNull: 'broadcasts.canceledAt' },
          ],
        },
      ],
    });
  });
});

describe('getBroadcastWithReport', () => {
  it('exposes the scheduling fields to managers', async () => {
    const scheduledFor = new Date(NOW.getTime() - 2 * 60 * MINUTE);
    mockScoped({
      id: 7,
      communityId: 42,
      title: 'Water off',
      body: 'b',
      severity: 'info',
      targetAudience: 'all',
      channels: 'email',
      scheduledFor,
      sendClaimedAt: NOW,
      sendOutcome: 'missed',
      sendOutcomeReason: 'late',
    });

    const report = await getBroadcastWithReport(7, 42);

    expect(report).toMatchObject({
      scheduledFor,
      sendClaimedAt: NOW,
      sendOutcome: 'missed',
      sendOutcomeReason: 'late',
    });
  });
});
