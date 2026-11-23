/**
 * `processDueScheduledBroadcasts` — the cron that sends scheduled alerts.
 *
 * The database here is a small in-memory stand-in that honours the same
 * predicates as the job's two raw statements (scan, claim), so the tests can
 * assert BEHAVIOUR across runs. That the real SQL is atomic under concurrency
 * is a database fact and is proven in
 * `integration/scheduled-emergency-broadcasts.integration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  db,
  createScopedClientMock,
  logAuditEventMock,
  captureExceptionMock,
  executeBroadcastMock,
  resolveEmergencyRecipientsMock,
  writeBroadcastRecipientsMock,
  smsGloballyEnabledMock,
  tables,
} = vi.hoisted(() => ({
  db: { execute: vi.fn(), select: vi.fn() },
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  executeBroadcastMock: vi.fn(),
  resolveEmergencyRecipientsMock: vi.fn(),
  writeBroadcastRecipientsMock: vi.fn(),
  smsGloballyEnabledMock: vi.fn(),
  tables: {
    communities: { id: 'communities.id', deletedAt: 'communities.deletedAt', communitySettings: 'communities.settings' },
    emergencyBroadcasts: {
      id: 'broadcasts.id',
      completedAt: 'broadcasts.completedAt',
      sendOutcome: 'broadcasts.sendOutcome',
    },
  },
}));

vi.mock('@propertypro/db', () => ({
  ...tables,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: () => db }));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  isNull: (col: unknown) => ({ __isNull: col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: captureExceptionMock }));
vi.mock('@/lib/sms/dispatch-flag', () => ({ isSmsDispatchGloballyEnabled: smsGloballyEnabledMock }));
vi.mock('../../src/lib/services/emergency-broadcast-service', () => ({
  executeBroadcast: executeBroadcastMock,
  resolveEmergencyRecipients: resolveEmergencyRecipientsMock,
  writeBroadcastRecipients: writeBroadcastRecipientsMock,
}));

import { processDueScheduledBroadcasts } from '../../src/lib/services/emergency-broadcast-schedule-service';

const NOW = new Date('2026-11-23T15:00:00.000Z');
const MINUTE = 60_000;

interface Row {
  id: number;
  community_id: number;
  initiated_by: string;
  title: string;
  scheduled_for: Date;
  severity: string;
  target_audience: string;
  channels: string;
  send_claimed_at: Date | null;
  canceled_at: Date | null;
  send_outcome: string | null;
  send_outcome_reason: string | null;
  completed_at: Date | null;
}

let rows: Row[];
let communityRows: Record<number, { deletedAt: Date | null; settings: unknown }>;

function seed(id: number, minutesAgo: number, extra: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    community_id: 42,
    initiated_by: 'manager-1',
    title: `Alert ${id}`,
    scheduled_for: new Date(NOW.getTime() - minutesAgo * MINUTE),
    severity: 'info',
    target_audience: 'owners_only',
    channels: 'sms,email',
    send_claimed_at: null,
    canceled_at: null,
    send_outcome: null,
    send_outcome_reason: null,
    completed_at: null,
    ...extra,
  };
  rows.push(row);
  return row;
}

const claimable = (r: Row) => !r.send_claimed_at && !r.canceled_at && !r.send_outcome;

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  communityRows = { 42: { deletedAt: null, settings: {} }, 43: { deletedAt: null, settings: {} } };

  db.execute.mockImplementation(async (query: { text: string; values: unknown[] }) => {
    if (query.text.includes('UPDATE emergency_broadcasts')) {
      const row = rows.find((r) => r.id === query.values[0]);
      if (!row || !claimable(row)) return [];
      row.send_claimed_at = new Date();
      return [row];
    }
    const cutoff = new Date(query.values[0] as string).getTime();
    return rows
      .filter((r) => claimable(r) && r.scheduled_for.getTime() <= cutoff)
      .sort((a, b) => a.scheduled_for.getTime() - b.scheduled_for.getTime())
      .map((r) => ({ id: r.id }));
  });
  db.select.mockImplementation(() => ({
    from: () => ({
      where: async (where: { __eq: [unknown, number] }) => {
        const community = communityRows[where.__eq[1]];
        return community ? [community] : [];
      },
    }),
  }));
  createScopedClientMock.mockImplementation(() => ({
    update: vi.fn(async (_table: unknown, data: Record<string, unknown>, where: { __eq?: unknown[]; __and?: Array<{ __eq?: unknown[] }> }) => {
      const id = (where.__and?.[0]?.__eq ?? where.__eq)?.[1];
      const row = rows.find((r) => r.id === id);
      if (!row) return [];
      if ('sendOutcome' in data) {
        // Mirrors recordOutcome's guard: no outcome yet, and not sent.
        if (row.send_outcome || row.completed_at) return [];
        row.send_outcome = data['sendOutcome'] as string;
        row.send_outcome_reason = data['sendOutcomeReason'] as string;
      }
      return [row];
    }),
  }));
  logAuditEventMock.mockResolvedValue(undefined);
  smsGloballyEnabledMock.mockReturnValue(false);
  resolveEmergencyRecipientsMock.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
  writeBroadcastRecipientsMock.mockResolvedValue({ smsEligibleCount: 0, emailCount: 2 });
  executeBroadcastMock.mockImplementation(async (id: number) => {
    rows.find((r) => r.id === id)!.completed_at = new Date();
    return { smsQueued: 0, emailSent: 2 };
  });
});

describe('processDueScheduledBroadcasts', () => {
  it('sends a due alert once; a second run does nothing', async () => {
    seed(1, 2);
    seed(2, -10); // ten minutes in the future: not due

    const first = await processDueScheduledBroadcasts(NOW);
    const second = await processDueScheduledBroadcasts(NOW);

    expect(first).toEqual({ due: 1, sent: 1, missed: 0, failed: 0, claimedElsewhere: 0 });
    expect(second).toEqual({ due: 0, sent: 0, missed: 0, failed: 0, claimedElsewhere: 0 });
    expect(executeBroadcastMock).toHaveBeenCalledTimes(1);
    // The immediate-send path, as the system actor, naming the scheduler.
    expect(executeBroadcastMock).toHaveBeenCalledWith(1, 42, null, { scheduledBy: 'manager-1' });
  });

  it('resolves recipients at SEND time and writes their rows before sending', async () => {
    seed(1, 2);

    await processDueScheduledBroadcasts(NOW);

    expect(resolveEmergencyRecipientsMock).toHaveBeenCalledWith(42, 'owners_only', 'info');
    expect(writeBroadcastRecipientsMock).toHaveBeenCalledWith({
      communityId: 42,
      broadcastId: 1,
      recipients: [{ userId: 'u1' }, { userId: 'u2' }],
      channels: ['sms', 'email'],
      smsAllowed: false,
      persist: true,
    });
    expect(writeBroadcastRecipientsMock.mock.invocationCallOrder[0]!).toBeLessThan(
      executeBroadcastMock.mock.invocationCallOrder[0]!,
    );
  });

  it('skips SMS unless BOTH dispatch flags are on when the alert sends', async () => {
    const smsAllowedFor = async (globalOn: boolean, settings: unknown) => {
      rows = [];
      seed(1, 2);
      smsGloballyEnabledMock.mockReturnValue(globalOn);
      communityRows[42] = { deletedAt: null, settings };
      writeBroadcastRecipientsMock.mockClear();
      await processDueScheduledBroadcasts(NOW);
      return writeBroadcastRecipientsMock.mock.calls[0]?.[0].smsAllowed;
    };

    expect(await smsAllowedFor(false, { smsDispatchEnabled: true })).toBe(false);
    expect(await smsAllowedFor(true, {})).toBe(false);
    expect(await smsAllowedFor(true, { smsDispatchEnabled: 'true' })).toBe(false);
    expect(await smsAllowedFor(true, null)).toBe(false);
    expect(await smsAllowedFor(true, { smsDispatchEnabled: true })).toBe(true);
  });

  it('more than 60 minutes late: marked missed/late and NOT sent', async () => {
    const late = seed(1, 61);
    const onTheLine = seed(2, 60); // exactly 60 minutes: still sent

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 2, sent: 1, missed: 1, failed: 0, claimedElsewhere: 0 });
    expect(late).toMatchObject({ send_outcome: 'missed', send_outcome_reason: 'late' });
    expect(onTheLine.send_outcome).toBeNull();
    expect(executeBroadcastMock).toHaveBeenCalledTimes(1);
    expect(executeBroadcastMock.mock.calls[0]?.[0]).toBe(2);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: null,
      action: 'emergency_broadcast_missed',
      resourceType: 'emergency_broadcast',
      resourceId: '1',
      communityId: 42,
      metadata: {
        reason: 'late',
        title: 'Alert 1',
        scheduledBy: 'manager-1',
        scheduledFor: late.scheduled_for.toISOString(),
      },
    });
  });

  it('soft-deleted community: marked missed/community_deleted and NOT sent', async () => {
    const row = seed(1, 2, { community_id: 43 });
    communityRows[43] = { deletedAt: new Date(), settings: {} };

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toMatchObject({ sent: 0, missed: 1, failed: 0 });
    expect(row).toMatchObject({ send_outcome: 'missed', send_outcome_reason: 'community_deleted' });
    expect(resolveEmergencyRecipientsMock).not.toHaveBeenCalled();
    expect(executeBroadcastMock).not.toHaveBeenCalled();
  });

  it('a throwing send: marked failed with the error CLASS, not retried, and the next alert still goes', async () => {
    class EmailProviderDownError extends Error {}
    const bad = seed(1, 3);
    const good = seed(2, 2);
    executeBroadcastMock.mockImplementationOnce(async () => {
      throw new EmailProviderDownError('could not reach owner@example.com');
    });

    const summary = await processDueScheduledBroadcasts(NOW);
    const again = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 2, sent: 1, missed: 0, failed: 1, claimedElsewhere: 0 });
    expect(bad).toMatchObject({ send_outcome: 'failed', send_outcome_reason: 'EmailProviderDownError' });
    expect(good.completed_at).not.toBeNull();
    // Not retried: the failed row stays claimed and the next run finds nothing.
    expect(again.due).toBe(0);
    expect(executeBroadcastMock).toHaveBeenCalledTimes(2);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(EmailProviderDownError),
      expect.objectContaining({ extra: { broadcastId: 1, communityId: 42 } }),
    );
    const failedAudit = logAuditEventMock.mock.calls
      .map(([entry]) => entry)
      .find((entry) => entry.action === 'emergency_broadcast_failed');
    expect(failedAudit).toMatchObject({ userId: null, resourceId: '1' });
    // The class name only: the message carried an address.
    expect(JSON.stringify(failedAudit)).not.toContain('owner@example.com');
  });

  it('a row claimed or canceled between the scan and the claim is left alone', async () => {
    const row = seed(1, 2);
    const realExecute = db.execute.getMockImplementation()!;
    db.execute.mockImplementation(async (query: { text: string; values: unknown[] }) => {
      const result = await realExecute(query);
      // Another tick wins the claim right after our scan.
      if (!query.text.includes('UPDATE')) row.send_claimed_at = new Date();
      return result;
    });

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 1, sent: 0, missed: 0, failed: 0, claimedElsewhere: 1 });
    expect(executeBroadcastMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('does not relabel an alert as failed when the throw came after it was sent', async () => {
    const row = seed(1, 2);
    executeBroadcastMock.mockImplementationOnce(async () => {
      row.completed_at = new Date();
      throw new Error('audit insert failed');
    });

    await processDueScheduledBroadcasts(NOW);

    expect(row.send_outcome).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
