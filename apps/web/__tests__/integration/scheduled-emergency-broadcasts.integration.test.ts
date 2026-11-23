/**
 * Scheduled ("send later") emergency alerts against a real database.
 *
 * "One send, never two" rests on two conditional UPDATEs — the cron's claim and
 * the manager's cancel — each matching only an unclaimed, uncanceled row. That
 * exactly one of two concurrent statements wins is a property of Postgres row
 * locking, which a mocked builder cannot show. Hence this file:
 *
 *   - concurrent cron runs send each due alert exactly once;
 *   - a cancel racing the claim leaves each alert canceled XOR claimed;
 *   - the Missed rules and the CHECK constraint hold in SQL;
 *   - a resident sees none of scheduled / missed / failed.
 *
 * Email goes to `@propertypro/email`'s in-process test inbox (no RESEND key in
 * this environment), which is how "sent once" is counted.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { testInbox } from '@propertypro/email';
import {
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  getDescribeDb,
  requireDatabaseUrlInCI,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  cancelBroadcast,
  createBroadcast,
  executeBroadcast,
  getBroadcastForRecipient,
  getBroadcastWithReport,
  listBroadcastsForRecipient,
  paginateEmergencyBroadcasts,
  scheduleBroadcast,
} from '@/lib/services/emergency-broadcast-service';
import { processDueScheduledBroadcasts } from '@/lib/services/emergency-broadcast-schedule-service';

requireDatabaseUrlInCI('scheduled-emergency-broadcasts');

const describeDb = getDescribeDb();
const MINUTE = 60_000;

describeDb('scheduled emergency alerts — claim, cancel and the Missed rule in Postgres', () => {
  let state: TestKitState;
  let communityId: number;
  let deletedCommunityId: number;
  let managerId: string;
  let residentId: string;

  type BroadcastRow = {
    id: number;
    completedAt: Date | null;
    canceledAt: Date | null;
    sendClaimedAt: Date | null;
    sendOutcome: string | null;
    sendOutcomeReason: string | null;
    recipientCount: number;
  };

  /** A scheduled alert whose time was `minutesAgo` minutes ago (validation bypassed on purpose). */
  async function seedDue(title: string, minutesAgo: number, inCommunity = communityId): Promise<number> {
    const { emergencyBroadcasts, createScopedClient } = state.dbModule;
    const [row] = (await createScopedClient(inCommunity).insert(emergencyBroadcasts, {
      title,
      body: `${title} body`,
      severity: 'info',
      targetAudience: 'all',
      channels: ['email'],
      initiatedBy: managerId,
      scheduledFor: new Date(Date.now() - minutesAgo * MINUTE),
    })) as Array<{ id: number }>;
    return Number(row!.id);
  }

  async function load(ids: number[]): Promise<Map<number, BroadcastRow>> {
    const { emergencyBroadcasts } = state.dbModule;
    const rows = (await state.db
      .select()
      .from(emergencyBroadcasts)
      .where(inArray(emergencyBroadcasts.id, ids))) as BroadcastRow[];
    return new Map(rows.map((r) => [Number(r.id), r]));
  }

  async function recipientRowCount(broadcastId: number): Promise<number> {
    const { emergencyBroadcastRecipients } = state.dbModule;
    const rows = await state.db
      .select()
      .from(emergencyBroadcastRecipients)
      .where(eq(emergencyBroadcastRecipients.broadcastId, broadcastId));
    return rows.length;
  }

  const emailsFor = (title: string) => testInbox.filter((m) => m.subject.includes(title)).length;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA' || c.key === 'communityB'),
    );
    communityId = requireCommunity(state, 'communityA').id;
    deletedCommunityId = requireCommunity(state, 'communityB').id;
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'camA' || u.key === 'tenantA'),
    );
    managerId = requireUser(state, 'camA').id;
    residentId = requireUser(state, 'tenantA').id;
  });

  afterAll(async () => {
    if (!state) return;
    await state.db
      .update(state.dbModule.communities)
      .set({ deletedAt: null })
      .where(eq(state.dbModule.communities.id, deletedCommunityId));
    await teardownTestKit(state);
  });

  it('three concurrent cron runs send each due alert exactly once', async () => {
    const titles = ['Race A', 'Race B', 'Race C', 'Race D'].map((t) => `${t} ${state.runSuffix}`);
    const ids: number[] = [];
    for (const title of titles) ids.push(await seedDue(title, 2));

    const summaries = await Promise.all([
      processDueScheduledBroadcasts(),
      processDueScheduledBroadcasts(),
      processDueScheduledBroadcasts(),
    ]);

    // Exactly one winner per row, across all three runs.
    expect(summaries.reduce((n, s) => n + s.sent, 0)).toBe(ids.length);
    expect(summaries.reduce((n, s) => n + s.failed + s.missed, 0)).toBe(0);
    const rows = await load(ids);
    for (const [index, id] of ids.entries()) {
      const row = rows.get(id)!;
      expect(row.sendClaimedAt).toBeInstanceOf(Date);
      expect(row.completedAt).toBeInstanceOf(Date);
      expect(row.sendOutcome).toBeNull();
      // Recipients were resolved at send time: the manager and the tenant, once each.
      expect(row.recipientCount).toBe(2);
      expect(await recipientRowCount(id)).toBe(2);
      expect(emailsFor(titles[index]!)).toBe(2);
    }

    // And a later run finds nothing left to do for them.
    await processDueScheduledBroadcasts();
    for (const title of titles) expect(emailsFor(title)).toBe(2);
  });

  it('cancel racing the claim: every alert ends canceled XOR claimed, never both', async () => {
    const titles = Array.from({ length: 6 }, (_, i) => `Cancel race ${i} ${state.runSuffix}`);
    const ids: number[] = [];
    for (const title of titles) ids.push(await seedDue(title, 2));

    const [, , ...cancelResults] = await Promise.all([
      processDueScheduledBroadcasts(),
      processDueScheduledBroadcasts(),
      ...ids.map((id) => cancelBroadcast(id, communityId, managerId)),
    ]);

    const rows = await load(ids);
    for (const [index, id] of ids.entries()) {
      const row = rows.get(id)!;
      const canceled = row.canceledAt !== null;
      const claimed = row.sendClaimedAt !== null;
      expect(canceled !== claimed, `broadcast ${id}: canceled=${canceled} claimed=${claimed}`).toBe(true);
      // cancelBroadcast reported the truth about who won.
      expect(cancelResults[index]).toBe(canceled);
      // A canceled alert reached nobody; a claimed one was sent once.
      expect(emailsFor(titles[index]!)).toBe(canceled ? 0 : 2);
      expect(await recipientRowCount(id)).toBe(canceled ? 0 : 2);
    }
  });

  it('claim first, then cancel: the cancel loses', async () => {
    const title = `Claimed first ${state.runSuffix}`;
    const id = await seedDue(title, 2);

    await processDueScheduledBroadcasts();

    // completed_at is set by now, which cancelBroadcast reports by throwing.
    await expect(cancelBroadcast(id, communityId, managerId)).rejects.toThrow(/already sent/);
    expect((await load([id])).get(id)!.canceledAt).toBeNull();
    expect(emailsFor(title)).toBe(2);
  });

  it('claimed but not yet sent: the cancel UPDATE matches no row', async () => {
    const id = await seedDue(`Mid-send ${state.runSuffix}`, 2);
    const { emergencyBroadcasts } = state.dbModule;
    // The state a cancel sees while the cron is between its claim and the send.
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: new Date() })
      .where(eq(emergencyBroadcasts.id, id));

    await expect(cancelBroadcast(id, communityId, managerId)).resolves.toBe(false);
    expect((await load([id])).get(id)!.canceledAt).toBeNull();
  });

  it('cancel first, then the cron: the claim finds nothing and nothing is sent', async () => {
    const title = `Canceled first ${state.runSuffix}`;
    const id = await seedDue(title, 2);

    await expect(cancelBroadcast(id, communityId, managerId)).resolves.toBe(true);
    await processDueScheduledBroadcasts();

    const row = (await load([id])).get(id)!;
    expect(row.canceledAt).toBeInstanceOf(Date);
    expect(row.sendClaimedAt).toBeNull();
    expect(row.completedAt).toBeNull();
    expect(emailsFor(title)).toBe(0);
  });

  it('more than 60 minutes late: missed/late, nothing sent, system-actor audit entry', async () => {
    const title = `Late ${state.runSuffix}`;
    const id = await seedDue(title, 61);

    await processDueScheduledBroadcasts();

    const row = (await load([id])).get(id)!;
    expect(row).toMatchObject({ sendOutcome: 'missed', sendOutcomeReason: 'late', completedAt: null });
    expect(emailsFor(title)).toBe(0);
    expect(await recipientRowCount(id)).toBe(0);

    const audit = (await state.sqlClient`
      select user_id, metadata from compliance_audit_log
       where community_id = ${communityId}
         and action = 'emergency_broadcast_missed'
         and resource_id = ${String(id)}
    `) as unknown as Array<{ user_id: string | null; metadata: Record<string, unknown> }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.user_id).toBeNull();
    expect(audit[0]!.metadata).toMatchObject({ reason: 'late', scheduledBy: managerId });
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain(`${title} body`);
  });

  it('soft-deleted community: missed/community_deleted, nothing sent', async () => {
    const title = `Deleted community ${state.runSuffix}`;
    const id = await seedDue(title, 2, deletedCommunityId);
    await state.db
      .update(state.dbModule.communities)
      .set({ deletedAt: new Date() })
      .where(eq(state.dbModule.communities.id, deletedCommunityId));

    await processDueScheduledBroadcasts();

    const row = (await load([id])).get(id)!;
    expect(row).toMatchObject({
      sendOutcome: 'missed',
      sendOutcomeReason: 'community_deleted',
      completedAt: null,
    });
    expect(emailsFor(title)).toBe(0);
  });

  it('a claim that never finished: failed/interrupted after 15 minutes, untouched before', async () => {
    const { emergencyBroadcasts } = state.dbModule;
    const staleTitle = `Interrupted ${state.runSuffix}`;
    const staleId = await seedDue(staleTitle, 20);
    const freshId = await seedDue(`Still sending ${state.runSuffix}`, 20);
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: new Date(Date.now() - 16 * MINUTE) })
      .where(eq(emergencyBroadcasts.id, staleId));
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: new Date(Date.now() - 14 * MINUTE) })
      .where(eq(emergencyBroadcasts.id, freshId));

    const summary = await processDueScheduledBroadcasts();

    expect(summary.interrupted).toBe(1);
    const rows = await load([staleId, freshId]);
    expect(rows.get(staleId)).toMatchObject({
      sendOutcome: 'failed',
      sendOutcomeReason: 'interrupted',
      completedAt: null,
    });
    expect(rows.get(freshId)!.sendOutcome).toBeNull();
    expect(emailsFor(staleTitle)).toBe(0);

    const audit = (await state.sqlClient`
      select user_id, metadata from compliance_audit_log
       where community_id = ${communityId}
         and action = 'emergency_broadcast_failed'
         and resource_id = ${String(staleId)}
    `) as unknown as Array<{ user_id: string | null; metadata: Record<string, unknown> }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.user_id).toBeNull();
    expect(audit[0]!.metadata).toMatchObject({ reason: 'interrupted', scheduledBy: managerId });

    // Give the still-sending row an outcome so later runs in this file ignore it.
    await state.db
      .update(emergencyBroadcasts)
      .set({ completedAt: new Date() })
      .where(eq(emergencyBroadcasts.id, freshId));
  });

  it('the CHECK constraint refuses any outcome but missed or failed', async () => {
    const id = await seedDue(`Check ${state.runSuffix}`, -60);
    const { emergencyBroadcasts } = state.dbModule;

    await expect(
      state.db.update(emergencyBroadcasts).set({ sendOutcome: 'sent' }).where(eq(emergencyBroadcasts.id, id)),
    ).rejects.toThrow();
    await state.db.update(emergencyBroadcasts).set({ canceledAt: new Date() }).where(eq(emergencyBroadcasts.id, id));
  });

  it('a draft scheduled in place is one row, sent exactly once, with recipients resolved at send time', async () => {
    const { emergencyBroadcasts, emergencyBroadcastRecipients, createScopedClient } = state.dbModule;
    const title = `From draft ${state.runSuffix}`;
    const before = (await state.db.select().from(emergencyBroadcasts)).length;
    const draft = await createBroadcast({
      communityId,
      title,
      body: 'Water off 9 to noon.',
      severity: 'info',
      targetAudience: 'all',
      channels: ['email'],
      smsAllowed: false,
      initiatedBy: managerId,
    });
    expect(await recipientRowCount(draft.broadcastId)).toBe(2);

    const scheduledFor = new Date(Date.now() + 30 * MINUTE);
    await expect(scheduleBroadcast(draft.broadcastId, communityId, managerId, scheduledFor)).resolves.toEqual({
      scheduled: true,
      scheduledFor: scheduledFor.toISOString(),
    });

    // Converted, not copied: still one row, now scheduled, its draft recipients gone.
    expect((await state.db.select().from(emergencyBroadcasts)).length).toBe(before + 1);
    expect(await getBroadcastWithReport(draft.broadcastId, communityId)).toMatchObject({
      scheduledFor,
      recipientCount: 2,
      sendClaimedAt: null,
      completedAt: null,
    });
    expect(await recipientRowCount(draft.broadcastId)).toBe(0);

    // The predicate in Postgres: a second schedule, and an immediate send, are both refused.
    await expect(
      scheduleBroadcast(draft.broadcastId, communityId, managerId, scheduledFor),
    ).rejects.toThrow('This alert has already been sent, scheduled or canceled.');

    // The crash case: the draft's rows were never deleted. One stale row, for a
    // resident, with an address the send must not use.
    await createScopedClient(communityId).insert(emergencyBroadcastRecipients, {
      broadcastId: draft.broadcastId,
      userId: residentId,
      email: 'stale-draft-address@example.com',
      phone: null,
      smsStatus: 'skipped',
      emailStatus: 'pending',
    });
    // Make it due without waiting 30 minutes.
    await state.db
      .update(emergencyBroadcasts)
      .set({ scheduledFor: new Date(Date.now() - 2 * MINUTE) })
      .where(eq(emergencyBroadcasts.id, draft.broadcastId));

    const summaries = await Promise.all([processDueScheduledBroadcasts(), processDueScheduledBroadcasts()]);

    expect(summaries.reduce((n, s) => n + s.sent, 0)).toBe(1);
    expect(summaries.reduce((n, s) => n + s.failed, 0)).toBe(0);
    const row = (await load([draft.broadcastId])).get(draft.broadcastId)!;
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.sendOutcome).toBeNull();
    // The send-time list replaced the stale row: two recipients, two emails, once.
    expect(await recipientRowCount(draft.broadcastId)).toBe(2);
    expect(emailsFor(title)).toBe(2);
    expect(testInbox.filter((m) => JSON.stringify(m).includes('stale-draft-address@example.com'))).toHaveLength(0);

    // Sent: it can no longer be scheduled, and another run does not send it again.
    await expect(
      scheduleBroadcast(draft.broadcastId, communityId, managerId, scheduledFor),
    ).rejects.toThrow('This alert has already been sent, scheduled or canceled.');
    await processDueScheduledBroadcasts();
    expect(emailsFor(title)).toBe(2);
  });

  /** An immediate draft, as the composer makes at "Next: Confirm": two recipient rows. */
  async function draftAlert(title: string): Promise<number> {
    const draft = await createBroadcast({
      communityId,
      title,
      body: 'Water off 9 to noon.',
      severity: 'info',
      targetAudience: 'all',
      channels: ['email'],
      smsAllowed: false,
      initiatedBy: managerId,
    });
    return draft.broadcastId;
  }
  const won = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' && r.value !== false;

  it('send racing schedule on one draft: exactly one wins, and the loser changes nothing', async () => {
    const later = new Date(Date.now() + 30 * MINUTE);
    let sendWins = 0;
    let scheduleWins = 0;
    // Both orders are forced once, then the pair is raced for real.
    for (const order of ['send-first', 'schedule-first', 'race', 'race', 'race'] as const) {
      const title = `Send vs schedule ${order} ${sendWins + scheduleWins} ${state.runSuffix}`;
      const id = await draftAlert(title);
      const send = () => executeBroadcast(id, communityId, managerId);
      const schedule = () => scheduleBroadcast(id, communityId, managerId, later);

      let results: PromiseSettledResult<unknown>[];
      if (order === 'send-first') results = [...(await Promise.allSettled([send()])), ...(await Promise.allSettled([schedule()]))];
      else if (order === 'schedule-first') {
        const scheduled = await Promise.allSettled([schedule()]);
        results = [...(await Promise.allSettled([send()])), ...scheduled];
      } else results = await Promise.allSettled([send(), schedule()]);
      const [sent, scheduled] = results as [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>];

      expect([won(sent), won(scheduled)].filter(Boolean)).toHaveLength(1);
      const report = (await getBroadcastWithReport(id, communityId))!;
      if (won(sent)) {
        sendWins += 1;
        // Sent now, once, with its delivery rows intact and never scheduled.
        expect(report.completedAt).toBeInstanceOf(Date);
        expect(report.scheduledFor).toBeNull();
        expect(await recipientRowCount(id)).toBe(2);
        expect(emailsFor(title)).toBe(2);
        expect((scheduled as PromiseRejectedResult).reason.message).toBe(
          'This alert has already been sent, scheduled or canceled.',
        );
      } else {
        scheduleWins += 1;
        // Scheduled, nothing sent, nothing claimed.
        expect(report).toMatchObject({ scheduledFor: later, completedAt: null, sendClaimedAt: null });
        expect(emailsFor(title)).toBe(0);
        expect(await recipientRowCount(id)).toBe(0);
        await cancelBroadcast(id, communityId, managerId);
      }
      // Whoever won, the job has nothing to send for this alert now.
      await processDueScheduledBroadcasts();
      expect(emailsFor(title)).toBe(won(sent) ? 2 : 0);
    }
    expect(sendWins).toBeGreaterThanOrEqual(1);
    expect(scheduleWins).toBeGreaterThanOrEqual(1);
  });

  it('two concurrent sends of one draft send once', async () => {
    const title = `Double send ${state.runSuffix}`;
    const id = await draftAlert(title);

    const results = await Promise.allSettled([
      executeBroadcast(id, communityId, managerId),
      executeBroadcast(id, communityId, managerId),
      executeBroadcast(id, communityId, managerId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(emailsFor(title)).toBe(2);
    expect(await recipientRowCount(id)).toBe(2);
    // And a late third click is refused too.
    await expect(executeBroadcast(id, communityId, managerId)).rejects.toThrow();
    expect(emailsFor(title)).toBe(2);
  });

  it('cancel racing the immediate send: the alert ends canceled XOR sent', async () => {
    let cancelWins = 0;
    let sendWins = 0;
    for (const order of ['cancel-first', 'send-first', 'race', 'race', 'race'] as const) {
      const title = `Cancel vs send ${order} ${cancelWins + sendWins} ${state.runSuffix}`;
      const id = await draftAlert(title);
      const cancel = () => cancelBroadcast(id, communityId, managerId);
      const send = () => executeBroadcast(id, communityId, managerId);

      let canceled: PromiseSettledResult<unknown>;
      let sent: PromiseSettledResult<unknown>;
      if (order === 'cancel-first') {
        [canceled] = await Promise.allSettled([cancel()]);
        [sent] = await Promise.allSettled([send()]);
      } else if (order === 'send-first') {
        [sent] = await Promise.allSettled([send()]);
        [canceled] = await Promise.allSettled([cancel()]);
      } else [canceled, sent] = await Promise.allSettled([cancel(), send()]);

      expect([won(canceled!), won(sent!)].filter(Boolean)).toHaveLength(1);
      const row = (await load([id])).get(id)!;
      if (won(canceled!)) {
        cancelWins += 1;
        expect(row.canceledAt).toBeInstanceOf(Date);
        expect(row.completedAt).toBeNull();
        expect(row.sendClaimedAt).toBeNull();
        expect(emailsFor(title)).toBe(0);
      } else {
        sendWins += 1;
        expect(row.canceledAt).toBeNull();
        expect(row.completedAt).toBeInstanceOf(Date);
        expect(emailsFor(title)).toBe(2);
      }
    }
    expect(cancelWins).toBeGreaterThanOrEqual(1);
    expect(sendWins).toBeGreaterThanOrEqual(1);
  });

  it('a send already in flight (claimed, not finished) beats a cancel inside the undo window', async () => {
    const { emergencyBroadcasts } = state.dbModule;
    const id = await draftAlert(`In flight ${state.runSuffix}`);
    // What a cancel finds when the send's claim landed just before it: the
    // draft is seconds old, not completed, not canceled, but claimed.
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: new Date() })
      .where(eq(emergencyBroadcasts.id, id));

    await expect(cancelBroadcast(id, communityId, managerId)).resolves.toBe(false);

    expect((await load([id])).get(id)!.canceledAt).toBeNull();
    // The loser changed nothing: recipients are still pending, not skipped.
    const { emergencyBroadcastRecipients } = state.dbModule;
    const recipients = (await state.db
      .select()
      .from(emergencyBroadcastRecipients)
      .where(eq(emergencyBroadcastRecipients.broadcastId, id))) as Array<{ emailStatus: string }>;
    expect(recipients.map((r) => r.emailStatus)).toEqual(['pending', 'pending']);
    // Finish it so later job runs in this file leave it alone.
    await state.db.update(emergencyBroadcasts).set({ completedAt: new Date() }).where(eq(emergencyBroadcasts.id, id));
  });

  it('an immediate send that died after its claim is swept to failed/interrupted, with no scheduled time', async () => {
    const { emergencyBroadcasts } = state.dbModule;
    const title = `Died mid-send ${state.runSuffix}`;
    const id = await draftAlert(title);
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: new Date(Date.now() - 16 * MINUTE) })
      .where(eq(emergencyBroadcasts.id, id));

    const summary = await processDueScheduledBroadcasts();

    expect(summary.interrupted).toBe(1);
    expect((await load([id])).get(id)).toMatchObject({ sendOutcome: 'failed', sendOutcomeReason: 'interrupted' });
    expect(emailsFor(title)).toBe(0);
    // Still not sendable afterwards (a 409): no retry of a possibly partial send.
    await expect(executeBroadcast(id, communityId, managerId)).rejects.toThrow(
      'This alert is already being sent, or has been sent, scheduled or canceled.',
    );
    // The sweep's entry is worded for an immediate alert: no scheduling keys.
    const audit = (await state.sqlClient`
      select user_id, metadata from compliance_audit_log
       where community_id = ${communityId}
         and action = 'emergency_broadcast_failed'
         and resource_id = ${String(id)}
    `) as unknown as Array<{ user_id: string | null; metadata: Record<string, unknown> }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toEqual({ reason: 'interrupted', title, initiatedBy: managerId });
  });

  it('an alert that has already gone out is never claimed, even with a due time and no claim', async () => {
    const { emergencyBroadcasts } = state.dbModule;
    const title = `Already sent ${state.runSuffix}`;
    const id = await seedDue(title, 2);
    await state.db
      .update(emergencyBroadcasts)
      .set({ completedAt: new Date() })
      .where(eq(emergencyBroadcasts.id, id));

    await processDueScheduledBroadcasts();

    const row = (await load([id])).get(id)!;
    expect(row.sendClaimedAt).toBeNull();
    expect(emailsFor(title)).toBe(0);
  });

  it('schedules through createBroadcast: no recipient rows, visible to the manager, invisible to the resident', async () => {
    const scheduledFor = new Date(Date.now() + 30 * MINUTE);
    const result = await createBroadcast({
      communityId,
      title: `Future ${state.runSuffix}`,
      body: 'Water off 9 to noon.',
      severity: 'info',
      targetAudience: 'all',
      channels: ['email'],
      smsAllowed: false,
      initiatedBy: managerId,
      scheduledFor,
    });

    expect(result).toMatchObject({ recipientCount: 2, emailCount: 2, scheduledFor: scheduledFor.toISOString() });
    expect(await recipientRowCount(result.broadcastId)).toBe(0);

    // Not due: the cron leaves it alone.
    await processDueScheduledBroadcasts();
    const row = (await load([result.broadcastId])).get(result.broadcastId)!;
    expect(row.sendClaimedAt).toBeNull();

    const report = await getBroadcastWithReport(result.broadcastId, communityId);
    expect(report).toMatchObject({ scheduledFor, sendClaimedAt: null, sendOutcome: null, channels: ['email'] });
    expect(await getBroadcastForRecipient(result.broadcastId, communityId, residentId)).toBeNull();

    await expect(cancelBroadcast(result.broadcastId, communityId, managerId)).resolves.toBe(true);
  });

  it('a resident sees none of scheduled, missed or failed — even a failed send that has their recipient row', async () => {
    const { emergencyBroadcasts, emergencyBroadcastRecipients, createScopedClient } = state.dbModule;
    const scheduledId = await seedDue(`Hidden scheduled ${state.runSuffix}`, -120);
    const missedId = await seedDue(`Hidden missed ${state.runSuffix}`, -120);
    const failedId = await seedDue(`Hidden failed ${state.runSuffix}`, -120);
    const claimedAt = new Date();
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: claimedAt, sendOutcome: 'missed', sendOutcomeReason: 'late' })
      .where(eq(emergencyBroadcasts.id, missedId));
    await state.db
      .update(emergencyBroadcasts)
      .set({ sendClaimedAt: claimedAt, sendOutcome: 'failed', sendOutcomeReason: 'send_error' })
      .where(eq(emergencyBroadcasts.id, failedId));
    // A send that threw part-way leaves recipient rows behind.
    await createScopedClient(communityId).insert(emergencyBroadcastRecipients, {
      broadcastId: failedId,
      userId: residentId,
      email: 'someone@example.com',
    });

    for (const id of [scheduledId, missedId, failedId]) {
      expect(await getBroadcastForRecipient(id, communityId, residentId)).toBeNull();
    }
    const hidden = new Set([scheduledId, missedId, failedId]);
    const list = await listBroadcastsForRecipient(communityId, residentId);
    expect(list.filter((b) => hidden.has(b.id))).toEqual([]);
    const residentPage = await paginateEmergencyBroadcasts({ communityId, recipientUserId: residentId, pageSize: 100 });
    expect(residentPage.data.filter((b) => hidden.has(Number(b['id'])))).toEqual([]);

    // Control: the manager's list carries all three, with the outcome fields.
    const managerPage = await paginateEmergencyBroadcasts({ communityId, pageSize: 100 });
    const byId = new Map(managerPage.data.map((b) => [Number(b['id']), b]));
    expect(byId.get(scheduledId)).toMatchObject({ scheduledFor: expect.any(Date), sendOutcome: null });
    expect(byId.get(missedId)).toMatchObject({ sendOutcome: 'missed', sendOutcomeReason: 'late' });
    expect(byId.get(failedId)).toMatchObject({ sendOutcome: 'failed', sendOutcomeReason: 'send_error' });

    // Leave nothing claimable behind for other runs of the cron.
    await state.db
      .update(emergencyBroadcasts)
      .set({ canceledAt: new Date() })
      .where(eq(emergencyBroadcasts.id, scheduledId));
  });
});
