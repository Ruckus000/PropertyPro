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
  createUnscopedClient: () => ({ execute: executeMock }),
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

import { processDueSitePublishes } from '@/lib/services/site-publish-schedule-service';

/** First execute() call is the claim; the rest are per-row finishes. */
function claimReturning(rows: unknown[]) {
  executeMock.mockReset();
  executeMock.mockResolvedValueOnce(rows);
  executeMock.mockResolvedValue([]);
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

    const claimSql = executeMock.mock.calls[0][0].__sql.strings.join('?');
    expect(claimSql).toContain('UPDATE site_publish_schedules');
    expect(claimSql).toContain("SET status = 'running'");
    expect(claimSql).toContain("WHERE status = 'pending'");
    expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimSql).toContain('RETURNING');
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
    expect(summary).toEqual({ claimed: 1, published: 1, nothingToPublish: 0, failed: 0 });

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
    const finishValues = executeMock.mock.calls[1][0].__sql.values;
    expect(finishValues).toContain('failed');
    expect(finishValues.some((v: unknown) => String(v).includes('no longer has an account'))).toBe(
      true,
    );
  });

  it('records the reason on failure rather than leaving it to the console', async () => {
    claimReturning([ROW]);
    publishMock.mockRejectedValueOnce(new Error('deadlock detected'));

    const summary = await processDueSitePublishes();

    expect(summary).toMatchObject({ failed: 1 });
    expect(executeMock.mock.calls[1][0].__sql.values).toContain('deadlock detected');
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

    expect(summary).toEqual({ claimed: 3, published: 2, nothingToPublish: 0, failed: 1 });
  });

  it('does nothing, quietly, when nothing is due', async () => {
    claimReturning([]);

    const summary = await processDueSitePublishes();

    expect(summary).toEqual({ claimed: 0, published: 0, nothingToPublish: 0, failed: 0 });
    expect(publishMock).not.toHaveBeenCalled();
    // Only the claim ran — no finish statements.
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});
