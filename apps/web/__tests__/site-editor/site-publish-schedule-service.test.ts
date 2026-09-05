/**
 * The scheduled-publish worker (launch blocker #7).
 *
 * These cases are mostly about what one bad schedule must NOT do: stop the
 * other communities in the same tick, publish under a fabricated actor, or
 * fail silently — a schedule that fires, fails and says nothing is worse than
 * no schedule at all, because the PM believes their statutory notice went out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, publishMock, notifyMock, logAuditEventMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  publishMock: vi.fn(),
  notifyMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    execute: executeMock,
    // `scheduleSitePublish` is transactional now. The fake hands the callback a
    // handle whose `execute` is the SAME spy, so the tx's statements land in
    // `executeMock.mock.calls` in order and can be asserted like any other.
    transaction: (fn: (tx: { execute: typeof executeMock }) => unknown) =>
      Promise.resolve(fn({ execute: executeMock })),
  }),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  createScopedClient: () => ({
    selectFrom: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue([]),
  }),
  sitePublishSchedules: {
    id: 'id',
    communityId: 'community_id',
    scheduledFor: 'scheduled_for',
    status: 'status',
    notifySummary: 'notify_summary',
    deletedAt: 'deleted_at',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ __and: c }),
  asc: (c: unknown) => ({ __asc: c }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  isNull: (c: unknown) => ({ __isNull: c }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    { raw: (v: string) => v },
  ),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  publishCommunitySite: publishMock,
}));

vi.mock('@/lib/services/site-publish-notification', () => ({
  notifyResidentsOfSitePublish: notifyMock,
}));

import {
  processDueSitePublishes,
  failExhaustedSchedules,
  scheduleSitePublish,
  SITE_PUBLISH_SCHEDULE_LEASE_MS,
} from '@/lib/services/site-publish-schedule-service';
import { ConflictError } from '@/lib/api/errors';

/**
 * First `execute()` is the claim; then one finish per row; then the exhausted
 * sweep, which is always last.
 */
function claimReturning(rows: unknown[]) {
  executeMock.mockReset();
  executeMock.mockResolvedValueOnce(rows);
  executeMock.mockResolvedValue([]);
}

/** The SQL text of the nth execute() call, for substring assertions. */
function sqlOf(callIndex: number): string {
  return executeMock.mock.calls[callIndex][0].__sql.strings.join('?');
}

/** The bound values of the nth execute() call. */
function valuesOf(callIndex: number): unknown[] {
  return executeMock.mock.calls[callIndex][0].__sql.values;
}

/** The last execute() call — the sweep. */
function lastSql(): string {
  return executeMock.mock.calls.at(-1)![0].__sql.strings.join('?');
}

const ROW = {
  id: 1,
  community_id: 42,
  requested_by: 'user-1',
  notify_summary: null,
};

describe('processDueSitePublishes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    publishMock.mockResolvedValue({
      published: true,
      publishedAt: new Date(),
      promotedCount: 2,
      retiredCount: 0,
    });
    notifyMock.mockResolvedValue({ status: 'sent', announcementId: 9, recipientCount: 3 });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('claims rows with a conditional UPDATE off pending, not a bare SELECT', async () => {
    /*
     * The claim IS the lock. Reading `status = 'pending'` and then publishing
     * would let two overlapping cron ticks publish the same schedule — Vercel
     * Cron is at-least-once, and a slow tick can still be running when the next
     * fires. Only rows the UPDATE returns are ours.
     */
    claimReturning([ROW]);

    await processDueSitePublishes(new Date('2026-08-01T15:00:00Z'));

    const claimSql = sqlOf(0);
    expect(claimSql).toContain('UPDATE site_publish_schedules');
    expect(claimSql).toContain("SET status = 'running'");
    expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimSql).toContain('RETURNING');
    // `running` is claimable, which is what makes a crashed tick recoverable.
    expect(claimSql).toContain("status IN ('pending', 'running')");
  });

  it('publishes each claimed schedule and records the outcome', async () => {
    claimReturning([ROW]);

    const summary = await processDueSitePublishes();

    expect(publishMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      // Null on purpose — see the note in the service. A schedule has no editor
      // session, so there is no optimistic-concurrency token to honour.
      expectedPublishedAt: null,
    });
    expect(summary).toEqual({ claimed: 1, published: 1, nothingToPublish: 0, failed: 0, exhausted: 0 });

    const finishSql = executeMock.mock.calls[1][0].__sql;
    expect(finishSql.strings.join('?')).toContain('SET status =');
    expect(finishSql.values).toContain('published');
  });

  it('records nothing_to_publish as its own terminal state, not a failure', async () => {
    /*
     * The schedule fired correctly and there were no drafts. Calling that
     * "failed" would tell a PM their scheduled notice broke when it simply had
     * nothing to do.
     */
    claimReturning([ROW]);
    publishMock.mockResolvedValueOnce({ published: false, reason: 'nothing-to-publish' });

    const summary = await processDueSitePublishes();

    expect(summary).toMatchObject({ published: 0, nothingToPublish: 1, failed: 0 });
    expect(executeMock.mock.calls[1][0].__sql.values).toContain('nothing_to_publish');
  });

  it('notifies residents when the schedule carried a summary', async () => {
    claimReturning([{ ...ROW, notify_summary: 'Pool hours updated' }]);

    await processDueSitePublishes();

    expect(notifyMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      summary: 'Pool hours updated',
    });
  });

  it('does not notify when the publish was a no-op', async () => {
    claimReturning([{ ...ROW, notify_summary: 'Pool hours updated' }]);
    publishMock.mockResolvedValueOnce({ published: false, reason: 'nothing-to-publish' });

    await processDueSitePublishes();

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('fails visibly when the scheduling manager no longer has an account', async () => {
    /*
     * publishCommunitySite stamps actorUserId into the publish snapshot's audit
     * trail. Substituting a system actor would attribute a publish to someone
     * who did not make it, so there is no honest way to run this one.
     */
    claimReturning([{ ...ROW, requested_by: null }]);

    const summary = await processDueSitePublishes();

    expect(publishMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ failed: 1, published: 0 });
    const finishValues = valuesOf(1);
    expect(finishValues).toContain('failed');
    // The specific cause is in the console line; the row carries PM-facing text.
    expect(finishValues.some((v: unknown) => String(v).includes('nothing was published'))).toBe(
      true,
    );
  });

  it('records the reason on failure rather than leaving it to the console', async () => {
    claimReturning([ROW]);
    publishMock.mockRejectedValueOnce(new Error('deadlock detected'));

    const summary = await processDueSitePublishes();

    expect(summary).toMatchObject({ failed: 1 });
    /*
     * The RAW error goes to the console, never into the row: `error_message` is
     * read back by the publish sheet and lives in a tenant table, so driver
     * text (constraint names, connection detail) must not land in it.
     */
    expect(valuesOf(1).join(' ')).not.toContain('deadlock detected');
    expect(valuesOf(1).some((v) => String(v).includes('nothing was published'))).toBe(true);
  });

  it('keeps going after one community fails', async () => {
    /*
     * One association's broken schedule must not stop every other
     * association's publish in the same tick.
     */
    claimReturning([
      { ...ROW, id: 1, community_id: 42 },
      { ...ROW, id: 2, community_id: 43 },
      { ...ROW, id: 3, community_id: 44 },
    ]);
    publishMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ published: true, publishedAt: new Date(), promotedCount: 1, retiredCount: 0 })
      .mockResolvedValueOnce({ published: true, publishedAt: new Date(), promotedCount: 1, retiredCount: 0 });

    const summary = await processDueSitePublishes();

    expect(summary).toEqual({ claimed: 3, published: 2, nothingToPublish: 0, failed: 1, exhausted: 0 });
  });

  it('does nothing, quietly, when nothing is due', async () => {
    claimReturning([]);

    const summary = await processDueSitePublishes();

    expect(summary).toEqual({ claimed: 0, published: 0, nothingToPublish: 0, failed: 0, exhausted: 0 });
    expect(publishMock).not.toHaveBeenCalled();
    // The claim and the sweep — and no finish statements in between.
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(lastSql()).toContain('attempt_count >=');
  });
});

describe('the lease — crash recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    publishMock.mockResolvedValue({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('takes back a row whose lease has lapsed', async () => {
    /*
     * The whole point. A Vercel function killed by the platform deadline throws
     * nothing — no catch runs, no terminal status is written — so without this
     * the row sits in `running` forever: never retried, invisible to the PM,
     * and the statutory notice silently never goes out.
     */
    claimReturning([ROW]);

    await processDueSitePublishes(new Date('2026-08-01T15:00:00Z'));

    const claimSql = sqlOf(0);
    expect(claimSql).toContain("status IN ('pending', 'running')");
    expect(claimSql).toContain('lease_expires_at IS NULL OR lease_expires_at <');
  });

  it('writes a lease that expires exactly one lease-length out', async () => {
    const now = new Date('2026-08-01T15:00:00Z');
    claimReturning([ROW]);

    await processDueSitePublishes(now);

    expect(sqlOf(0)).toContain('lease_expires_at =');
    /*
     * Asserted as an ISO STRING, not a Date, and that is the point rather than
     * an incidental detail. postgres-js cannot serialise a bare `Date` as an
     * untyped bind parameter — it throws ERR_INVALID_ARG_TYPE on the client —
     * so every Date this file's raw statements bind is converted first. This
     * case previously searched the bound values for `v instanceof Date`, which
     * passed against exactly the shape that took the cron down in production.
     * Pinning the serialised form keeps that regression visible here as well as
     * in site-publish-schedule.integration.test.ts.
     */
    const expected = new Date(now.getTime() + SITE_PUBLISH_SCHEDULE_LEASE_MS).toISOString();
    expect(valuesOf(0)).toContain(expected);
    expect(valuesOf(0).some((v) => v instanceof Date)).toBe(false);
  });

  it('will not claim a row that has used every attempt', async () => {
    // Without this bound, a schedule that fails every time would cycle between
    // running and reclaimed forever.
    claimReturning([ROW]);

    await processDueSitePublishes();

    expect(sqlOf(0)).toContain('attempt_count <');
  });

  it('releases the lease when a schedule reaches a terminal state', async () => {
    // A finished row must not look leased, or the sweep would spare it forever.
    claimReturning([ROW]);

    await processDueSitePublishes();

    expect(sqlOf(1)).toContain('lease_expires_at = NULL');
  });
});

describe('failExhaustedSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('gives up only on rows that are out of attempts AND not currently leased', async () => {
    /*
     * The lease clause is not redundant: a row on its final attempt may be
     * mid-flight and about to succeed, and failing it there would report a
     * failure for a publish that then happened.
     */
    executeMock.mockReset();
    executeMock.mockResolvedValue([{ id: 4 }]);

    const ids = await failExhaustedSchedules(new Date('2026-08-01T15:00:00Z'));

    const sweep = sqlOf(0);
    expect(sweep).toContain("SET status = 'failed'");
    expect(sweep).toContain('attempt_count >=');
    expect(sweep).toContain('lease_expires_at IS NULL OR lease_expires_at <');
    expect(ids).toEqual([4]);
  });

  it('records a reason the PM can act on, not an error code', async () => {
    executeMock.mockReset();
    executeMock.mockResolvedValue([]);

    await failExhaustedSchedules();

    const reason = valuesOf(0).find((v) => typeof v === 'string' && v.length > 20) as string;
    expect(reason).toContain('Nothing was published');
    expect(reason).toMatch(/schedule it again|publish now/i);
  });

  it('runs AFTER the claim loop, never before', async () => {
    /*
     * Ordering matters for rows the loop just finished: sweeping first would
     * judge them on their pre-run attempt count and could give up on a schedule
     * that was about to succeed.
     */
    claimReturning([ROW]);
    publishMock.mockResolvedValue({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });

    await processDueSitePublishes();

    expect(lastSql()).toContain('attempt_count >=');
  });

  it('a failing sweep does not lose the tick’s work', async () => {
    claimReturning([ROW]);
    publishMock.mockResolvedValue({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Claim ok, finish ok, sweep throws.
    executeMock.mockReset();
    executeMock
      .mockResolvedValueOnce([ROW])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('sweep exploded'));

    const summary = await processDueSitePublishes();

    expect(summary.published).toBe(1);
    expect(summary.exhausted).toBe(0);
  });
});

describe('scheduleSitePublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('locks the community row, then cancels only pending, then inserts', async () => {
    /*
     * The row lock is the primary fix for the race — it serialises two managers
     * scheduling at once AND a schedule racing an immediate publish, which takes
     * the same lock. Cancelling `pending` only matters because a `running` row
     * is mid-publish: cancelling it would race that tick's own completion write.
     */
    executeMock.mockReset();
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 9, scheduled_for: new Date('2026-08-01T15:00:00Z'), notify_summary: null },
      ]);

    await scheduleSitePublish({
      communityId: 42,
      actorUserId: 'user-1',
      scheduledFor: new Date('2026-08-01T15:00:00Z'),
      notifySummary: null,
    });

    expect(sqlOf(0)).toContain('FOR UPDATE');
    expect(sqlOf(1)).toContain("status = 'pending'");
    expect(sqlOf(1)).not.toContain('running');
    expect(sqlOf(2)).toContain('INSERT INTO site_publish_schedules');
  });

  it('turns a unique violation into a 409, not a raw 500', async () => {
    executeMock.mockReset();
    executeMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    executeMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(
      scheduleSitePublish({
        communityId: 42,
        actorUserId: 'user-1',
        scheduledFor: new Date(),
        notifySummary: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('finds the violation even when the driver wraps it in `cause`', async () => {
    // The recursive walk is the thing under test — a top-level check alone
    // misses the wrapped shape the driver actually throws.
    executeMock.mockReset();
    executeMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    executeMock.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { cause: { code: '23505' } }),
    );

    await expect(
      scheduleSitePublish({
        communityId: 42,
        actorUserId: 'user-1',
        scheduledFor: new Date(),
        notifySummary: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets an unrelated error through unchanged', async () => {
    executeMock.mockReset();
    executeMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    executeMock.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      scheduleSitePublish({
        communityId: 42,
        actorUserId: 'user-1',
        scheduledFor: new Date(),
        notifySummary: null,
      }),
    ).rejects.toThrow('connection reset');
  });
});
