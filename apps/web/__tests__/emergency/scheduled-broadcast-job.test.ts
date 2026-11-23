/**
 * `processDueScheduledBroadcasts` — the cron that sends scheduled alerts.
 *
 * The database here is a small in-memory stand-in that honours the same
 * predicates as the job's two raw statements (scan, claim), so the tests can
 * assert BEHAVIOUR across runs. That the real SQL is atomic under concurrency
 * is a database fact and is proven in
 * `integration/scheduled-emergency-broadcasts.integration.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    emergencyBroadcastRecipients: { broadcastId: 'recipients.broadcastId' },
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

import {
  CLAIM_BUDGET_MS,
  CRON_MAX_DURATION_SECONDS,
  processDueScheduledBroadcasts,
  sanitizedError,
} from '../../src/lib/services/emergency-broadcast-schedule-service';

const hardDeleteMock = vi.fn(async (_table: unknown, _where: unknown) => []);

const NOW = new Date('2026-11-23T15:00:00.000Z');
const MINUTE = 60_000;

interface Row {
  id: number;
  community_id: number;
  initiated_by: string;
  title: string;
  scheduled_for: Date | null;
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
    if (query.text.includes('send_claimed_at <')) {
      // The interrupted sweep: claimed before the cutoff, and no outcome of any kind.
      return rows.filter(
        (r) =>
          r.send_claimed_at &&
          r.send_claimed_at.getTime() < cutoff &&
          !r.completed_at &&
          !r.canceled_at &&
          !r.send_outcome,
      );
    }
    return rows
      .filter((r) => claimable(r) && r.scheduled_for !== null && r.scheduled_for.getTime() <= cutoff)
      .sort((a, b) => a.scheduled_for!.getTime() - b.scheduled_for!.getTime())
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
    hardDelete: hardDeleteMock,
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

    expect(first).toEqual({ due: 1, sent: 1, missed: 0, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
    expect(second).toEqual({ due: 0, sent: 0, missed: 0, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
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

  it('clears any recipient rows left on the alert (a draft scheduled in place) before writing the send-time list', async () => {
    seed(1, 2);

    await processDueScheduledBroadcasts(NOW);

    expect(hardDeleteMock).toHaveBeenCalledTimes(1);
    expect(hardDeleteMock).toHaveBeenCalledWith(tables.emergencyBroadcastRecipients, {
      __eq: ['recipients.broadcastId', 1],
    });
    expect(hardDeleteMock.mock.invocationCallOrder[0]!).toBeLessThan(
      writeBroadcastRecipientsMock.mock.invocationCallOrder[0]!,
    );
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

    expect(summary).toEqual({ due: 2, sent: 1, missed: 1, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
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
        scheduledFor: late.scheduled_for!.toISOString(),
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

  it('a throwing send: marked failed/send_error, not retried, and the next alert still goes', async () => {
    class EmailProviderDownError extends Error {}
    const bad = seed(1, 3);
    const good = seed(2, 2);
    executeBroadcastMock.mockImplementationOnce(async () => {
      throw new EmailProviderDownError('could not reach owner@example.com');
    });

    const summary = await processDueScheduledBroadcasts(NOW);
    const again = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 2, sent: 1, missed: 0, failed: 1, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
    // A fixed reason, never the class name (which a production build can minify to a letter).
    expect(bad).toMatchObject({ send_outcome: 'failed', send_outcome_reason: 'send_error' });
    expect(good.completed_at).not.toBeNull();
    // Not retried: the failed row stays claimed and the next run finds nothing.
    expect(again.due).toBe(0);
    expect(executeBroadcastMock).toHaveBeenCalledTimes(2);
    // Sentry gets a sanitised stand-in, never the thrown object.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [captured, context] = captureExceptionMock.mock.calls[0]!;
    expect(captured).not.toBeInstanceOf(EmailProviderDownError);
    expect(captured.message).toBe('Scheduled emergency alert job failed: EmailProviderDownError');
    expect(context).toMatchObject({ extra: { broadcastId: 1, communityId: 42 } });
    expect(JSON.stringify([captured.message, captured.stack, context])).not.toContain('owner@example.com');
    const failedAudit = logAuditEventMock.mock.calls
      .map(([entry]) => entry)
      .find((entry) => entry.action === 'emergency_broadcast_failed');
    expect(failedAudit).toMatchObject({ userId: null, resourceId: '1', metadata: { reason: 'send_error' } });
    expect(JSON.stringify(failedAudit)).not.toContain('owner@example.com');
    expect(JSON.stringify(failedAudit)).not.toContain('EmailProviderDownError');
  });

  it('a row claimed or canceled between the scan and the claim is left alone', async () => {
    const row = seed(1, 2);
    const realExecute = db.execute.getMockImplementation()!;
    db.execute.mockImplementation(async (query: { text: string; values: unknown[] }) => {
      const result = await realExecute(query);
      // Another tick wins the claim right after our scan.
      if (!query.text.includes('UPDATE') && !query.text.includes('send_claimed_at <')) {
        row.send_claimed_at = new Date();
      }
      return result;
    });

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 1, sent: 0, missed: 0, failed: 0, claimedElsewhere: 1, interrupted: 0, deferred: 0 });
    expect(executeBroadcastMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('a claim 14 minutes old with no outcome is left alone', async () => {
    const row = seed(1, 20, { send_claimed_at: new Date(NOW.getTime() - 14 * MINUTE) });

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 0, sent: 0, missed: 0, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
    expect(row.send_outcome).toBeNull();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('a claim 16 minutes old with no outcome is marked failed/interrupted, audited, and never sent', async () => {
    const row = seed(1, 20, { send_claimed_at: new Date(NOW.getTime() - 16 * MINUTE) });
    const sent = seed(2, 20, {
      send_claimed_at: new Date(NOW.getTime() - 16 * MINUTE),
      completed_at: new Date(NOW.getTime() - 15 * MINUTE),
    });
    const canceled = seed(3, 20, {
      send_claimed_at: new Date(NOW.getTime() - 16 * MINUTE),
      canceled_at: new Date(NOW.getTime() - 15 * MINUTE),
    });

    const summary = await processDueScheduledBroadcasts(NOW);
    const again = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 0, sent: 0, missed: 0, failed: 1, claimedElsewhere: 0, interrupted: 1, deferred: 0 });
    expect(again.interrupted).toBe(0);
    expect(row).toMatchObject({ send_outcome: 'failed', send_outcome_reason: 'interrupted' });
    expect(sent.send_outcome).toBeNull();
    expect(canceled.send_outcome).toBeNull();
    expect(executeBroadcastMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: null,
      action: 'emergency_broadcast_failed',
      resourceType: 'emergency_broadcast',
      resourceId: '1',
      communityId: 42,
      metadata: {
        reason: 'interrupted',
        title: 'Alert 1',
        scheduledBy: 'manager-1',
        scheduledFor: row.scheduled_for!.toISOString(),
      },
    });
  });

  it('an IMMEDIATE send that died after its claim (no scheduled time) is swept the same way', async () => {
    const row = seed(1, 0, { scheduled_for: null, send_claimed_at: new Date(NOW.getTime() - 16 * MINUTE) });

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toMatchObject({ due: 0, failed: 1, interrupted: 1 });
    expect(row).toMatchObject({ send_outcome: 'failed', send_outcome_reason: 'interrupted' });
    expect(logAuditEventMock.mock.calls[0]![0].metadata).toEqual({
      reason: 'interrupted',
      title: 'Alert 1',
      scheduledBy: 'manager-1',
      scheduledFor: null,
    });
  });

  it('nobody in the audience at send time: missed/no_recipients, audited, and the send path is never entered', async () => {
    const row = seed(1, 2);
    resolveEmergencyRecipientsMock.mockResolvedValue([]);

    const summary = await processDueScheduledBroadcasts(NOW);

    expect(summary).toEqual({ due: 1, sent: 0, missed: 1, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 });
    expect(row).toMatchObject({ send_outcome: 'missed', send_outcome_reason: 'no_recipients' });
    expect(writeBroadcastRecipientsMock).not.toHaveBeenCalled();
    expect(executeBroadcastMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'emergency_broadcast_missed',
        resourceId: '1',
        metadata: expect.objectContaining({ reason: 'no_recipients' }),
      }),
    );
  });

  it('stops CLAIMING once the time budget is spent: the rest stay unclaimed for the next tick', async () => {
    const first = seed(1, 4);
    const second = seed(2, 3);
    const third = seed(3, 2);
    // An injected clock: inside the budget for the first alert, past it afterwards.
    const readings = [0, CLAIM_BUDGET_MS + 1];
    const elapsedMs = vi.fn(() => readings.shift() ?? CLAIM_BUDGET_MS + 1);

    const summary = await processDueScheduledBroadcasts(NOW, { elapsedMs });

    expect(summary).toEqual({ due: 3, sent: 1, missed: 0, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 2 });
    expect(first.completed_at).not.toBeNull();
    for (const waiting of [second, third]) {
      expect(waiting.send_claimed_at).toBeNull();
      expect(waiting.send_outcome).toBeNull();
    }
    // Nothing is lost: the next tick, with time in hand, sends them.
    const next = await processDueScheduledBroadcasts(NOW, { elapsedMs: () => 0 });
    expect(next).toMatchObject({ due: 2, sent: 2, deferred: 0 });
  });

  it('exactly at the budget still claims; the budget is 60% of the maxDuration the route declares', async () => {
    seed(1, 2);
    const summary = await processDueScheduledBroadcasts(NOW, { elapsedMs: () => CLAIM_BUDGET_MS });
    expect(summary).toMatchObject({ sent: 1, deferred: 0 });

    // Next needs a literal in the route file, so the two numbers are pinned here.
    const route = readFileSync(
      resolve(__dirname, '../../src/app/api/v1/internal/scheduled-emergency-broadcasts/route.ts'),
      'utf8',
    );
    const declared = /^export const maxDuration = (\d+);$/m.exec(route);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(CRON_MAX_DURATION_SECONDS);
    expect(CLAIM_BUDGET_MS).toBe(CRON_MAX_DURATION_SECONDS * 1000 * 0.6);
  });

  it('a database error from the recipient insert reaches Sentry with no address or phone in it', async () => {
    seed(1, 2);
    // What drizzle + postgres.js raise for a failed insert: bound values in the
    // message, the offending row in `detail`, on the error and on its cause.
    class DrizzleQueryError extends Error {
      params = ['pat@example.com', '+13055551234'];
      detail = 'Key (email)=(pat@example.com) already exists.';
    }
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Failing row contains (pat@example.com, +13055551234).',
    });
    const thrown = new DrizzleQueryError(
      'Failed query: insert into "emergency_broadcast_recipients" ...\nparams: pat@example.com,+13055551234',
      { cause },
    );
    writeBroadcastRecipientsMock.mockRejectedValueOnce(thrown);

    await processDueScheduledBroadcasts(NOW);

    const [captured, context] = captureExceptionMock.mock.calls[0]!;
    expect(captured).not.toBe(thrown);
    expect(captured.name).toBe('ScheduledBroadcastJobError');
    expect(captured.message).toBe('Scheduled emergency alert job failed: DrizzleQueryError (SQLSTATE 23505)');
    expect(captured.cause).toBeUndefined();
    // Everything Sentry would serialise: own properties, message, stack, context.
    const payload = JSON.stringify([
      { ...captured },
      Object.getOwnPropertyNames(captured).map((key) => (captured as Record<string, unknown>)[key]),
      context,
    ]);
    expect(payload).not.toContain('pat@example.com');
    expect(payload).not.toContain('3055551234');
    expect(payload).toContain('at '); // the call frames survive
    expect(context.extra).toEqual({ broadcastId: 1, communityId: 42 });
  });

  it('sanitizedError copes with a thrown non-Error and ignores a code that is not a SQLSTATE', () => {
    expect(sanitizedError('pat@example.com went wrong').message).toBe(
      'Scheduled emergency alert job failed: UnknownError',
    );
    expect(sanitizedError(Object.assign(new TypeError('x'), { code: 'pat@example.com' })).message).toBe(
      'Scheduled emergency alert job failed: TypeError',
    );
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
