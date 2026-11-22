/**
 * Deletion lifecycle follow-ups to #1510, against a real database.
 *
 * Recovery (`claimDeletionRecoveryOp` / `completeUserRecoveryOp`, the database
 * half of apps/admin's recover route; the Supabase Auth ban calls are passed in
 * as callbacks, so the tests see exactly when each runs):
 * - a claim stamps nothing in `recovered_at` until the recovery finishes, so a
 *   recovery that stops part way is visible, never purged, and resumable;
 * - a lifted-ban failure gives the claim back and the account is purgeable on
 *   schedule again;
 * - a `soft_deleted` row on an OPEN account is stale: recovering it writes
 *   nothing, so the user's newer live request survives;
 * - any purged request of the target refuses the recovery;
 * - a user soft-deleted moments ago is refused (the cron's ban may be in flight);
 * - a community is recovered in one transaction, siblings included.
 *
 * Intervene (`interveneDeletionRequestOp`, and the web service's
 * `interveneCommunityDeletion` on top of it): every cooling request of the
 * target is cancelled, and nothing is when the target is already deleted.
 *
 * Community requests: one cooling request per community; the purge waits for
 * the community's own deletion to be due, and re-checks the community before
 * each storage sweep.
 *
 * The soft delete: duplicates of one user expiring in one batch are one ban.
 *
 * Inserts run-unique users and communities directly; afterAll deletes the
 * requests, then the test kit's teardown deletes the rest.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountDeletionRequests, communities, users } from '@propertypro/db';
import { eq, inArray, sql } from '@propertypro/db/filters';
// AUTHZ: Integration test for platform-level tables (users, communities, account_deletion_requests) and the deletion-request ops.
import {
  claimDeletionRecoveryOp,
  createUnscopedClient,
  completeUserRecoveryOp,
  interveneDeletionRequestOp,
} from '@propertypro/db/unsafe';
import {
  executeUserSoftDelete,
  findPurgeReadyDeletionRequests,
  findUnfinishedRecoveryRequestIds,
  interveneCommunityDeletion,
  purgeCommunityData,
  purgeUserPII,
  requestCommunityDeletion,
} from '../../src/lib/services/account-lifecycle-service';
import { onePerUser } from '../../src/lib/account-lifecycle/one-per-user';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { failNextAuthUpdateUserFor, getCapturedAuthUpdateUserIds } from './providers/test-auth-admin-provider';
import { beforeNextStorageList, getCapturedStorageOps } from './providers/test-storage-provider';

requireDatabaseUrlInCI('deletion-recovery-lifecycle');
const describeDb = getDescribeDb();

const RUN = randomUUID().slice(0, 8);
const LABELS = [
  'admin',
  'fresh',
  'crash',
  'unbanFails',
  'stale',
  'purgedSibling',
  'tooRecent',
  'scrubbed',
  'interveneUser',
  'interveneDeleted',
  'communityRequester',
  'softDeleteDupes',
  'authBare404',
  'lockOrder',
  'unbanAndRebanFail',
  'concurrentRelease',
  'concurrentFinish',
] as const;
type Label = (typeof LABELS)[number];
const USER_IDS = Object.fromEntries(LABELS.map((l) => [l, randomUUID()])) as Record<Label, string>;
const emailOf = (label: Label) => `recovery-${label}-${USER_IDS[label]}@lifecycletest.invalid`;

const COMMUNITY_LABELS = ['recover', 'inFlight', 'stale', 'intervene', 'deleted', 'cancelRoute', 'dedupe', 'timing', 'restoredMidPurge', 'restoredLater'] as const;
type CommunityLabel = (typeof COMMUNITY_LABELS)[number];

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 31 * DAY;
const longAgo = () => new Date(Date.now() - 7 * MONTH);
const past = () => new Date(Date.now() - DAY);
const future = (days: number) => new Date(Date.now() + days * DAY);

describeDb('deletion recovery and community lifecycle (integration)', () => {
  const db = createUnscopedClient();
  const communityIds = {} as Record<CommunityLabel, number>;
  // Only for its teardown: the community cancel writes an append-only audit
  // row, which the kit's teardown is the one place allowed to clear.
  let kit: TestKitState;

  async function userRequest(label: Label, status: string, coolingEndsAt = past(), scheduledPurgeAt: Date | null = null) {
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({ requestType: 'user', userId: USER_IDS[label], status, coolingEndsAt, scheduledPurgeAt })
      .returning({ id: accountDeletionRequests.id });
    return row!.id;
  }

  async function communityRequest(label: CommunityLabel, status: string, coolingEndsAt = past(), scheduledPurgeAt: Date | null = null) {
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({
        requestType: 'community',
        userId: USER_IDS.communityRequester,
        communityId: communityIds[label],
        status,
        coolingEndsAt,
        scheduledPurgeAt,
      })
      .returning({ id: accountDeletionRequests.id });
    return row!.id;
  }

  async function rowOf(id: number) {
    const [row] = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, id));
    return row!;
  }

  async function userOf(label: Label) {
    const [row] = await db.select().from(users).where(eq(users.id, USER_IDS[label]));
    return row!;
  }

  async function communityDeletedAt(label: CommunityLabel) {
    const [row] = await db
      .select({ deletedAt: communities.deletedAt })
      .from(communities)
      .where(eq(communities.id, communityIds[label]));
    return row!.deletedAt;
  }

  async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('waitFor: condition never held');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Until some session waits on a row lock of account_deletion_requests. */
  const waitForLockWait = () =>
    waitFor(async () => {
      const rows = await db.execute(
        sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%account_deletion_requests%'`,
      );
      return (rows as unknown[]).length > 0;
    });

  const markUserDeleted = (label: Label, at: Date | null) =>
    db.update(users).set({ deletedAt: at }).where(eq(users.id, USER_IDS[label]));
  const markCommunityDeleted = (label: CommunityLabel, at: Date | null) =>
    db.update(communities).set({ deletedAt: at }).where(eq(communities.id, communityIds[label]));

  const adminUserId = () => USER_IDS.admin;

  /** Ban callbacks for completeUserRecoveryOp that record each call. */
  function authCalls(liftBan = true, reapplyBan = true) {
    const calls: string[] = [];
    return {
      calls,
      auth: {
        liftBan: async () => (calls.push('lift'), liftBan),
        reapplyBan: async () => (calls.push('reapply'), reapplyBan),
      },
    };
  }

  beforeAll(async () => {
    kit = await initTestKit();
    for (const id of Object.values(USER_IDS)) trackUserForCleanup(kit, id);
    await db.insert(users).values(
      LABELS.map((label) => ({ id: USER_IDS[label], email: emailOf(label), fullName: `Recovery ${label}` })),
    );
    for (const label of COMMUNITY_LABELS) {
      const [row] = await db
        .insert(communities)
        .values({
          name: `Recovery ${label}`,
          slug: `recovery-${label.toLowerCase()}-${RUN}`,
          communityType: 'condo_718',
        })
        .returning({ id: communities.id });
      communityIds[label] = row!.id;
      trackCommunityForCleanup(kit, row!.id);
    }
  });

  afterAll(async () => {
    // Requests first: `user_id` is ON DELETE RESTRICT. The kit then clears the
    // communities' audit rows, the communities and the users.
    await db.delete(accountDeletionRequests).where(inArray(accountDeletionRequests.userId, Object.values(USER_IDS)));
    await teardownTestKit(kit);
  });

  // ── User recovery ─────────────────────────────────────────────────────────

  describe('user recovery', () => {
    it('claims every request of the user, cancels the cooling one, and stamps recovered_at only on finish', async () => {
      await markUserDeleted('fresh', longAgo());
      const chosen = await userRequest('fresh', 'soft_deleted', past(), past());
      const duplicate = await userRequest('fresh', 'soft_deleted', past(), past());
      const cooling = await userRequest('fresh', 'cooling', future(5));

      const claim = await claimDeletionRecoveryOp(chosen, { adminUserId: adminUserId() });

      expect(claim).toMatchObject({
        outcome: 'claimed',
        claimedRequestIds: [chosen, duplicate],
        cancelledRequestIds: [cooling],
        resumed: false,
      });
      // Claimed, not finished: recovered with no recovered_at, account still deleted.
      expect(await rowOf(chosen)).toMatchObject({ status: 'recovered', recoveredAt: null });
      expect(await rowOf(duplicate)).toMatchObject({ status: 'recovered', recoveredAt: null });
      expect((await rowOf(cooling)).status).toBe('cancelled');
      expect((await userOf('fresh')).deletedAt).not.toBeNull();

      const { auth, calls } = authCalls();
      const finished = await completeUserRecoveryOp(USER_IDS.fresh, auth);

      expect(finished).toEqual({ outcome: 'recovered', finishedRequestIds: [chosen, duplicate] });
      expect(calls).toEqual(['lift']);
      expect((await rowOf(chosen)).recoveredAt).toBeInstanceOf(Date);
      expect((await rowOf(duplicate)).recoveredAt).toBeInstanceOf(Date);
      expect((await userOf('fresh')).deletedAt).toBeNull();
      // A finished recovery is not recoverable again.
      expect((await claimDeletionRecoveryOp(chosen, { adminUserId: adminUserId() })).outcome).toBe('not_recoverable');
    });

    it('leaves a recovery that stopped after its claim unpurgeable and resumable', async () => {
      await markUserDeleted('crash', longAgo());
      const id = await userRequest('crash', 'soft_deleted', past(), past());
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('claimed');
      // ... and the route died here: no unban, no finish.

      // The nightly cron reports it, so it cannot sit past its purge date unseen.
      expect(await findUnfinishedRecoveryRequestIds()).toContain(id);

      // The purge leaves it alone, though the account is deleted and due.
      expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).not.toContain(id);
      await expect(purgeUserPII(id)).resolves.toBeNull();
      expect((await userOf('crash')).email).toBe(emailOf('crash'));

      // Recovering the same request again resumes it.
      const again = await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() });
      expect(again).toMatchObject({ outcome: 'claimed', claimedRequestIds: [id], resumed: true });
      expect((await completeUserRecoveryOp(USER_IDS.crash, authCalls().auth)).outcome).toBe('recovered');
      expect((await userOf('crash')).deletedAt).toBeNull();
      expect((await rowOf(id)).recoveredAt).toBeInstanceOf(Date);
      expect(await findUnfinishedRecoveryRequestIds()).not.toContain(id);
    });

    it('re-applies the ban and gives the claim back when lifting the ban fails, so the account is purgeable on schedule again', async () => {
      await markUserDeleted('unbanFails', longAgo());
      const id = await userRequest('unbanFails', 'soft_deleted', past(), past());
      const claim = await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() });
      expect(claim.outcome).toBe('claimed');

      const { auth, calls } = authCalls(false, true);
      const result = await completeUserRecoveryOp(USER_IDS.unbanFails, auth);

      expect(result).toEqual({ outcome: 'unban_failed', banReapplied: true, released: true, releasedRequestIds: [id] });
      expect(calls).toEqual(['lift', 'reapply']);
      expect(await rowOf(id)).toMatchObject({ status: 'soft_deleted', recoveredAt: null });
      expect((await userOf('unbanFails')).deletedAt).not.toBeNull();
      expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).toContain(id);
    });

    // A failed unban can still have landed. Without the ban confirmed back on,
    // giving the claim back would make the account purgeable while its owner
    // can sign in; it stays an unfinished recovery instead.
    it('keeps the claim when the ban cannot be re-applied either', async () => {
      await markUserDeleted('unbanAndRebanFail', longAgo());
      const id = await userRequest('unbanAndRebanFail', 'soft_deleted', past(), past());
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('claimed');

      const result = await completeUserRecoveryOp(USER_IDS.unbanAndRebanFail, authCalls(false, false).auth);

      expect(result).toEqual({ outcome: 'unban_failed', banReapplied: false, released: false, releasedRequestIds: [] });
      expect(await rowOf(id)).toMatchObject({ status: 'recovered', recoveredAt: null });
      expect(await findUnfinishedRecoveryRequestIds()).toContain(id);
      expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).not.toContain(id);
    });

    // Two recoveries of one account at once (a second tab, a retry after a
    // timeout). The first holds the user's rows locked across its ban calls;
    // the second waits, then finds the claim settled and makes NO ban call, so
    // it cannot leave a stale ban (or a lifted one) behind.
    it('a second completion waits for the first and changes nothing after the first gives the claim back', async () => {
      await markUserDeleted('concurrentRelease', longAgo());
      const id = await userRequest('concurrentRelease', 'soft_deleted', past(), past());
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('claimed');

      let failUnban!: (ok: boolean) => void;
      const firstCalls: string[] = [];
      const first = completeUserRecoveryOp(USER_IDS.concurrentRelease, {
        liftBan: () => (firstCalls.push('lift'), new Promise<boolean>((resolve) => (failUnban = resolve))),
        reapplyBan: async () => (firstCalls.push('reapply'), true),
      });
      await waitFor(async () => firstCalls.length === 1);
      const second = authCalls();
      let secondDone: Promise<unknown> = Promise.resolve();
      try {
        secondDone = completeUserRecoveryOp(USER_IDS.concurrentRelease, second.auth);
        await waitForLockWait();
      } finally {
        // Always let the first finish, or its open transaction would block
        // the cleanup and hang the suite instead of failing it.
        failUnban(false);
      }

      await expect(first).resolves.toMatchObject({ outcome: 'unban_failed', released: true });
      await expect(secondDone).resolves.toEqual({ outcome: 'not_claimed' });
      expect(second.calls).toEqual([]);
      expect(await rowOf(id)).toMatchObject({ status: 'soft_deleted' });
      expect((await userOf('concurrentRelease')).deletedAt).not.toBeNull();
    });

    it('a second completion waits for the first and changes nothing after the first finishes', async () => {
      await markUserDeleted('concurrentFinish', longAgo());
      const id = await userRequest('concurrentFinish', 'soft_deleted', past(), past());
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('claimed');

      let liftOk!: (ok: boolean) => void;
      const firstCalls: string[] = [];
      const first = completeUserRecoveryOp(USER_IDS.concurrentFinish, {
        liftBan: () => (firstCalls.push('lift'), new Promise<boolean>((resolve) => (liftOk = resolve))),
        reapplyBan: async () => (firstCalls.push('reapply'), true),
      });
      await waitFor(async () => firstCalls.length === 1);
      const second = authCalls();
      let secondDone: Promise<unknown> = Promise.resolve();
      try {
        secondDone = completeUserRecoveryOp(USER_IDS.concurrentFinish, second.auth);
        await waitForLockWait();
      } finally {
        liftOk(true);
      }

      await expect(first).resolves.toEqual({ outcome: 'recovered', finishedRequestIds: [id] });
      await expect(secondDone).resolves.toEqual({ outcome: 'not_claimed' });
      expect(second.calls).toEqual([]);
      expect((await userOf('concurrentFinish')).deletedAt).toBeNull();
    });

    it('refuses a stale soft_deleted row on an open account, and leaves the newer live request cooling', async () => {
      // Left behind by an earlier recovery; the account is open.
      const stale = await userRequest('stale', 'soft_deleted', past(), past());
      // The user asked to be deleted again.
      const live = await userRequest('stale', 'cooling', future(20));

      const claim = await claimDeletionRecoveryOp(stale, { adminUserId: adminUserId() });

      expect(claim.outcome).toBe('stale');
      expect((await rowOf(stale)).status).toBe('soft_deleted');
      expect((await rowOf(live)).status).toBe('cooling');
    });

    it('refuses while a purge holds another request of the same user, and writes nothing', async () => {
      await markUserDeleted('purgedSibling', longAgo());
      const chosen = await userRequest('purgedSibling', 'soft_deleted', past(), past());
      // A purge claimed the duplicate and has not finished.
      const purging = await userRequest('purgedSibling', 'purged', past(), past());
      const cooling = await userRequest('purgedSibling', 'cooling', future(3));

      const claim = await claimDeletionRecoveryOp(chosen, { adminUserId: adminUserId() });

      expect(claim.outcome).toBe('purged');
      expect((await rowOf(chosen)).status).toBe('soft_deleted');
      expect((await rowOf(purging)).status).toBe('purged');
      expect((await rowOf(cooling)).status).toBe('cooling');
    });

    it('refuses a user soft-deleted moments ago, while the cron ban may still land', async () => {
      await markUserDeleted('tooRecent', new Date(Date.now() - 60 * 1000));
      const id = await userRequest('tooRecent', 'soft_deleted', past(), future(180));

      const claim = await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() });

      expect(claim.outcome).toBe('too_recent');
      expect((await rowOf(id)).status).toBe('soft_deleted');
    });

    // Every deletion transaction locks request rows before the users row. A
    // resumed claim (an operator's second click) holds the request row and then
    // wants the users row; a finish that took the users row first would
    // deadlock with it, and Postgres would abort one of the two.
    it('completion takes the request rows before the users row, so it waits on a resumed claim instead of deadlocking', async () => {
      await markUserDeleted('lockOrder', longAgo());
      const id = await userRequest('lockOrder', 'soft_deleted', past(), past());
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('claimed');

      let finish: Promise<unknown> = Promise.resolve();
      await db.transaction(async (tx) => {
        // What the resumed claim holds first ...
        await tx.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, id)).for('update');
        finish = completeUserRecoveryOp(USER_IDS.lockOrder, authCalls().auth);
        // ... the finish now waits on it ...
        await waitFor(async () => {
          const rows = await db.execute(
            sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%account_deletion_requests%'`,
          );
          return (rows as unknown[]).length > 0;
        });
        // ... and the claim's next lock is the users row.
        await tx.select().from(users).where(eq(users.id, USER_IDS.lockOrder)).for('update');
      });

      await expect(finish).resolves.toMatchObject({ outcome: 'recovered', finishedRequestIds: [id] });
      expect((await userOf('lockOrder')).deletedAt).toBeNull();
    });

    it('completion restores nothing on a scrubbed row', async () => {
      await db
        .update(users)
        .set({ deletedAt: longAgo(), email: `deleted-${USER_IDS.scrubbed}@redacted` })
        .where(eq(users.id, USER_IDS.scrubbed));
      const id = await userRequest('scrubbed', 'recovered', past(), past());
      await db.update(accountDeletionRequests).set({ recoveredAt: null }).where(eq(accountDeletionRequests.id, id));

      const scrubbedAuth = authCalls();
      expect(await completeUserRecoveryOp(USER_IDS.scrubbed, scrubbedAuth.auth)).toEqual({ outcome: 'purged' });
      // Nothing to restore, so the ban is never touched.
      expect(scrubbedAuth.calls).toEqual([]);
      expect((await userOf('scrubbed')).deletedAt).not.toBeNull();
      expect((await rowOf(id)).recoveredAt).toBeNull();
      // And the claim refuses it outright.
      expect((await claimDeletionRecoveryOp(id, { adminUserId: adminUserId() })).outcome).toBe('purged');
    });
  });

  // ── Community recovery ────────────────────────────────────────────────────

  describe('community recovery', () => {
    it('recovers the community and every request of it in one step', async () => {
      await markCommunityDeleted('recover', longAgo());
      const chosen = await communityRequest('recover', 'soft_deleted', past(), past());
      const sibling = await communityRequest('recover', 'soft_deleted', past(), past());
      const cooling = await communityRequest('recover', 'cooling', future(4));

      const claim = await claimDeletionRecoveryOp(chosen, { adminUserId: adminUserId() });

      expect(claim).toMatchObject({
        outcome: 'recovered',
        communityId: communityIds.recover,
        claimedRequestIds: [chosen, sibling],
        cancelledRequestIds: [cooling],
      });
      expect(await communityDeletedAt('recover')).toBeNull();
      expect((await rowOf(chosen)).recoveredAt).toBeInstanceOf(Date);
      expect((await rowOf(sibling)).status).toBe('recovered');
      expect((await rowOf(sibling)).recoveredAt).toBeInstanceOf(Date);
      expect((await rowOf(cooling)).status).toBe('cancelled');
    });

    it('refuses while a purge of a sibling request is in flight', async () => {
      await markCommunityDeleted('inFlight', longAgo());
      const chosen = await communityRequest('inFlight', 'soft_deleted', past(), past());
      await communityRequest('inFlight', 'purged', past(), past());

      expect((await claimDeletionRecoveryOp(chosen, { adminUserId: adminUserId() })).outcome).toBe('purged');
      expect((await rowOf(chosen)).status).toBe('soft_deleted');
      expect(await communityDeletedAt('inFlight')).not.toBeNull();
    });

    it('refuses a stale request on a community that is not deleted', async () => {
      const stale = await communityRequest('stale', 'soft_deleted', past(), past());
      const live = await communityRequest('stale', 'cooling', future(10));

      expect((await claimDeletionRecoveryOp(stale, { adminUserId: adminUserId() })).outcome).toBe('stale');
      expect((await rowOf(live)).status).toBe('cooling');
    });
  });

  // ── Intervene ─────────────────────────────────────────────────────────────

  describe('intervene', () => {
    it('cancels every cooling request of the user, notes on each', async () => {
      const chosen = await userRequest('interveneUser', 'cooling', future(10));
      const duplicate = await userRequest('interveneUser', 'cooling', future(11));

      const result = await interveneDeletionRequestOp(chosen, { cancelledBy: adminUserId(), notes: 'asked by phone' });

      expect(result).toMatchObject({ outcome: 'cancelled', cancelledRequestIds: [chosen, duplicate] });
      expect(await rowOf(duplicate)).toMatchObject({ status: 'cancelled', interventionNotes: 'asked by phone' });
    });

    it('refuses when the account is already deleted through another request', async () => {
      await markUserDeleted('interveneDeleted', longAgo());
      await userRequest('interveneDeleted', 'soft_deleted', past(), future(100));
      const cooling = await userRequest('interveneDeleted', 'cooling', future(2));

      const result = await interveneDeletionRequestOp(cooling, { cancelledBy: adminUserId(), notes: null });

      expect(result.outcome).toBe('target_deleted');
      expect((await rowOf(cooling)).status).toBe('cooling');
    });

    it('cancels every cooling request of the community', async () => {
      const chosen = await communityRequest('intervene', 'cooling', future(10));
      const duplicate = await communityRequest('intervene', 'cooling', future(12));

      const result = await interveneDeletionRequestOp(chosen, { cancelledBy: adminUserId(), notes: null });

      expect(result).toMatchObject({ outcome: 'cancelled', cancelledRequestIds: [chosen, duplicate] });
    });

    it('refuses when the community is already deleted', async () => {
      await markCommunityDeleted('deleted', longAgo());
      const cooling = await communityRequest('deleted', 'cooling', future(2));

      expect((await interveneDeletionRequestOp(cooling, { cancelledBy: adminUserId(), notes: null })).outcome).toBe('target_deleted');
      expect((await rowOf(cooling)).status).toBe('cooling');
    });

    it('the community cancel route: all cooling requests stopped; a lost race to the cron is a 409', async () => {
      const first = await communityRequest('cancelRoute', 'cooling', future(10));
      const second = await communityRequest('cancelRoute', 'cooling', future(11));

      await interveneCommunityDeletion(first, { adminUserId: USER_IDS.communityRequester });
      expect((await rowOf(first)).status).toBe('cancelled');
      expect((await rowOf(second)).status).toBe('cancelled');
      // A second cancel of the same request: already done, no error.
      await expect(interveneCommunityDeletion(first, { adminUserId: USER_IDS.communityRequester })).resolves.toMatchObject({ status: 'cancelled' });

      // The cron soft-deleted it between the route's lookup and the cancel.
      const raced = await communityRequest('cancelRoute', 'soft_deleted', past(), future(180));
      await expect(
        interveneCommunityDeletion(raced, { adminUserId: USER_IDS.communityRequester }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect((await rowOf(raced)).status).toBe('soft_deleted');
    });
  });

  // ── Community requests and purge ──────────────────────────────────────────

  describe('community requests and purge', () => {
    it('keeps one cooling request per community', async () => {
      const first = await requestCommunityDeletion(communityIds.dedupe, USER_IDS.communityRequester);
      const second = await requestCommunityDeletion(communityIds.dedupe, USER_IDS.communityRequester);

      expect(second.id).toBe(first.id);
      const rows = await db
        .select({ id: accountDeletionRequests.id })
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.communityId, communityIds.dedupe));
      expect(rows).toHaveLength(1);
    });

    it('does not purge a community before its own deletion has had the full recovery window', async () => {
      // An old request with a passed purge date, on a community deleted yesterday.
      await markCommunityDeleted('timing', past());
      const id = await communityRequest('timing', 'soft_deleted', longAgo(), past());

      expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).not.toContain(id);
      await expect(purgeCommunityData(id)).resolves.toBeNull();
      expect((await rowOf(id)).status).toBe('soft_deleted');

      // Seven months later it is due.
      await markCommunityDeleted('timing', longAgo());
      expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).toContain(id);
      const purged = await purgeCommunityData(id);
      expect(purged?.purgedAt).toBeInstanceOf(Date);
    });

    it('stops before the next sweep when the community is restored during the first (site-assets) sweep', async () => {
      await markCommunityDeleted('restoredMidPurge', longAgo());
      const id = await communityRequest('restoredMidPurge', 'soft_deleted', past(), past());
      const cid = communityIds.restoredMidPurge;
      beforeNextStorageList('community-site-assets', `${cid}/`, () => markCommunityDeleted('restoredMidPurge', null).then(() => undefined));

      await expect(purgeCommunityData(id)).resolves.toBeNull();

      expect(await rowOf(id)).toMatchObject({ status: 'soft_deleted', purgedAt: null });
      const buckets = getCapturedStorageOps().filter((op) => op.path.startsWith(`${cid}/`) || op.path.startsWith(`exports/${cid}`)).map((op) => op.bucket);
      expect(buckets).not.toContain('community-assets');
      expect(buckets.some((b) => b !== 'community-site-assets')).toBe(false);
    });

    it('stops before the export sweep when the community is restored during the admin-assets sweep', async () => {
      await markCommunityDeleted('restoredLater', longAgo());
      const id = await communityRequest('restoredLater', 'soft_deleted', past(), past());
      const cid = communityIds.restoredLater;
      beforeNextStorageList('community-assets', `${cid}/`, () => markCommunityDeleted('restoredLater', null).then(() => undefined));

      await expect(purgeCommunityData(id)).resolves.toBeNull();

      expect(await rowOf(id)).toMatchObject({ status: 'soft_deleted', purgedAt: null });
      expect(getCapturedStorageOps().some((op) => op.path.startsWith(`exports/${cid}`))).toBe(false);
    });
  });

  // ── Purge: auth "not found" ───────────────────────────────────────────────

  // Only GoTrue's own `user_not_found` code means "nothing left to scrub". A
  // bare 404 (a proxy, a wrong URL) must leave the purge unfinished.
  it('does not finish a purge on a 404 that is not user_not_found', async () => {
    await markUserDeleted('authBare404', longAgo());
    const id = await userRequest('authBare404', 'soft_deleted', past(), past());
    failNextAuthUpdateUserFor(USER_IDS.authBare404, { status: 404, message: 'Not Found' });

    await expect(purgeUserPII(id)).rejects.toThrow(/Failed to scrub auth user/);

    expect(await rowOf(id)).toMatchObject({ status: 'purged', purgedAt: null });
    // The retry finishes it.
    expect((await purgeUserPII(id))?.purgedAt).toBeInstanceOf(Date);
  });

  // ── Soft delete ───────────────────────────────────────────────────────────

  it('bans a user with duplicate requests in one batch once, and counts them as one account', async () => {
    const first = await userRequest('softDeleteDupes', 'cooling', past());
    const second = await userRequest('softDeleteDupes', 'cooling', past());

    const rows = await executeUserSoftDelete([first, second]);

    expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([first, second]);
    expect(onePerUser(rows).map((r) => r.id)).toEqual([first]);
    expect(getCapturedAuthUpdateUserIds().filter((id) => id === USER_IDS.softDeleteDupes)).toHaveLength(1);
  });
});
