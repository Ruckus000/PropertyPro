/**
 * The account-deletion guards that live in SQL, against a real database. A
 * mocked query builder can only check their shape, not that Postgres applies
 * them.
 *
 * `cancelUserDeletion`:
 * - every cooling request the user has is cancelled, not one of them;
 * - a second cancel of the same request reports `already_cancelled`;
 * - once the ACCOUNT is deleted (`users.deleted_at` set, which the cron's soft
 *   delete does in the same transaction as the request flip), nothing is
 *   cancelled and the outcome is `too_late`. The legacy duplicate case: the
 *   cron soft-deleted the earlier request while a later one is still cooling.
 * - a `soft_deleted` request left behind on a RECOVERED account does not block
 *   a new request from being cancelled.
 *
 * `findPurgeReadyDeletionRequests` returns a user request only when its
 * account's CURRENT deletion (`users.deleted_at`) is older than the purge
 * delay: a stranded `soft_deleted` row cannot purge an open account, nor purge
 * a re-deleted one the night it is deleted again.
 *
 * The purge/recovery lock. The request row's status is the lock: the purge
 * claims `soft_deleted` → `purged` (with `purged_at` null until it finishes),
 * a recovery claims `soft_deleted` → `recovered`, and whichever lands first
 * wins. The recovery side lives in apps/admin and talks PostgREST, which this
 * suite has no server for, so `recoveryClaim` below issues the same
 * conditional UPDATE the route sends; the purge side is the real service.
 * Both interleavings are driven deterministically, plus a crashed purge and
 * its retry, a reopening landing between the purge's claim and its scrub, and
 * the community twin.
 *
 * Inserts run-unique users rows, one community and their requests directly;
 * afterAll deletes them (requests first: `user_id` is ON DELETE RESTRICT).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { accountDeletionRequests, communities, users } from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
// AUTHZ: Integration test for platform-level tables (users, account_deletion_requests, communities).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  cancelUserDeletion,
  findPurgeReadyDeletionRequests,
  purgeCommunityData,
  purgeUserPII,
} from '../../src/lib/services/account-lifecycle-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';
import {
  failNextAuthUpdateUserFor,
  getCapturedAuthUpdateUserIds,
} from './providers/test-auth-admin-provider';

requireDatabaseUrlInCI('account-deletion-cancel');
const describeDb = getDescribeDb();

const USER_IDS = {
  twoCooling: randomUUID(),
  concurrent: randomUUID(),
  duplicateAfterCron: randomUUID(),
  usersRowDeleted: randomUUID(),
  recoveredThenAgain: randomUUID(),
  purgeDeleted: randomUUID(),
  purgeRecovered: randomUUID(),
  purgeRedeleted: randomUUID(),
  purgeRace: randomUUID(),
  purgeNotSoftDeleted: randomUUID(),
  purgeTooRecent: randomUUID(),
  lockRecoveryFirst: randomUUID(),
  lockPurgeFirst: randomUUID(),
  lockCrashedPurge: randomUUID(),
  reopenedAfterClaim: randomUUID(),
  authMissing: randomUUID(),
  communityRequester: randomUUID(),
};
const COMMUNITY_SLUG = `deletion-guards-${USER_IDS.communityRequester}`;
type Label = keyof typeof USER_IDS;
const emailOf = (label: Label) => `deletion-guards-${label}-${USER_IDS[label]}@lifecycletest.invalid`;
const DAY = 24 * 60 * 60 * 1000;
// Rough, for placing timestamps well clear of the six-month purge delay.
const MONTH = 31 * DAY;

describeDb('account deletion SQL guards (integration)', () => {
  const db = createUnscopedClient();

  async function request(
    userId: string,
    status: string,
    coolingEndsAt: Date,
    scheduledPurgeAt: Date | null = null,
  ): Promise<number> {
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({ requestType: 'user', userId, status, coolingEndsAt, scheduledPurgeAt })
      .returning({ id: accountDeletionRequests.id });
    return row!.id;
  }

  async function statusOf(id: number): Promise<string> {
    const [row] = await db
      .select({ status: accountDeletionRequests.status })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, id));
    return row!.status;
  }

  const markUserDeleted = (userId: string, at: Date = new Date()) =>
    db.update(users).set({ deletedAt: at }).where(eq(users.id, userId));

  /**
   * The recovery's claim, exactly as apps/admin's recover route sends it:
   * `soft_deleted` → `recovered` for this id, only while still `soft_deleted`.
   * True when it matched.
   */
  async function recoveryClaim(id: number): Promise<boolean> {
    const rows = await db
      .update(accountDeletionRequests)
      .set({ status: 'recovered', recoveredAt: new Date() })
      .where(and(eq(accountDeletionRequests.id, id), eq(accountDeletionRequests.status, 'soft_deleted')))
      .returning({ id: accountDeletionRequests.id });
    return rows.length === 1;
  }

  /** Neither users nor auth.users was scrubbed for this user. */
  async function expectUntouched(label: Label) {
    const [user] = await db.select().from(users).where(eq(users.id, USER_IDS[label]));
    expect(user!.email).toBe(emailOf(label));
    expect(user!.fullName).toBe(`Deletion ${label}`);
    expect(getCapturedAuthUpdateUserIds()).not.toContain(USER_IDS[label]);
  }

  async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('waitFor: condition never held');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  let communityId = 0;
  async function communityRequest(status: string, scheduledPurgeAt: Date): Promise<number> {
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({
        requestType: 'community',
        userId: USER_IDS.communityRequester,
        communityId,
        status,
        coolingEndsAt: new Date(Date.now() - 2 * DAY),
        scheduledPurgeAt,
      })
      .returning({ id: accountDeletionRequests.id });
    return row!.id;
  }

  beforeAll(async () => {
    await db.insert(users).values(
      (Object.keys(USER_IDS) as Label[]).map((label) => ({
        id: USER_IDS[label],
        email: emailOf(label),
        fullName: `Deletion ${label}`,
      })),
    );
    const [community] = await db
      .insert(communities)
      // Deleted long enough ago for its purge to be due.
      .values({ name: 'Deletion Guards', slug: COMMUNITY_SLUG, communityType: 'condo_718', deletedAt: new Date(Date.now() - 7 * MONTH) })
      .returning({ id: communities.id });
    communityId = community!.id;
  });

  afterAll(async () => {
    const ids = Object.values(USER_IDS);
    await db.delete(accountDeletionRequests).where(inArray(accountDeletionRequests.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
    if (communityId) await db.delete(communities).where(eq(communities.id, communityId));
  });

  it('cancels every cooling request the user has', async () => {
    const userId = USER_IDS.twoCooling;
    const first = await request(userId, 'cooling', new Date(Date.now() + 10 * DAY));
    const second = await request(userId, 'cooling', new Date(Date.now() + 11 * DAY));

    const result = await cancelUserDeletion(userId, userId, first);

    expect(result.outcome).toBe('cancelled');
    expect(await statusOf(first)).toBe('cancelled');
    expect(await statusOf(second)).toBe('cancelled');
  });

  it('reports already_cancelled to the second of two cancels of one request', async () => {
    const userId = USER_IDS.concurrent;
    const id = await request(userId, 'cooling', new Date(Date.now() + 10 * DAY));

    expect((await cancelUserDeletion(userId, userId, id)).outcome).toBe('cancelled');
    expect(await cancelUserDeletion(userId, userId, id)).toEqual({ outcome: 'already_cancelled' });
  });

  it('refuses after the cron soft-deleted the earlier of two requests, leaving the later one cooling', async () => {
    const userId = USER_IDS.duplicateAfterCron;
    // What the cron leaves: the expired request soft_deleted AND the user row
    // marked deleted, in one transaction. The later request has not expired.
    await request(userId, 'soft_deleted', new Date(Date.now() - DAY));
    await markUserDeleted(userId);
    const later = await request(userId, 'cooling', new Date(Date.now() + DAY));

    const result = await cancelUserDeletion(userId, userId, later);

    expect(result).toEqual({ outcome: 'too_late', status: 'cooling' });
    expect(await statusOf(later)).toBe('cooling');
  });

  it('refuses when the users row is deleted', async () => {
    const userId = USER_IDS.usersRowDeleted;
    await markUserDeleted(userId);
    const id = await request(userId, 'cooling', new Date(Date.now() + DAY));

    const result = await cancelUserDeletion(userId, userId, id);

    expect(result).toEqual({ outcome: 'too_late', status: 'cooling' });
    expect(await statusOf(id)).toBe('cooling');
  });

  it('cancels a new request on a recovered account that still carries a stranded soft_deleted row', async () => {
    const userId = USER_IDS.recoveredThenAgain;
    // One cron run soft-deleted both duplicates; an operator recovered one,
    // which cleared users.deleted_at and left the other soft_deleted.
    await request(userId, 'recovered', new Date(Date.now() - 2 * DAY));
    await request(userId, 'soft_deleted', new Date(Date.now() - 2 * DAY));
    // The user asks again, then changes their mind.
    const again = await request(userId, 'cooling', new Date(Date.now() + 30 * DAY));

    const result = await cancelUserDeletion(userId, userId, again);

    expect(result.outcome).toBe('cancelled');
    expect(await statusOf(again)).toBe('cancelled');
  });

  it('never offers a request for purge when its account is not deleted', async () => {
    const past = new Date(Date.now() - DAY);
    // Deleted seven months ago: the six-month recovery window has passed.
    await markUserDeleted(USER_IDS.purgeDeleted, new Date(Date.now() - 7 * MONTH));
    const deletedAccount = await request(USER_IDS.purgeDeleted, 'soft_deleted', past, past);
    // Stranded by an old recovery: soft_deleted, purge date passed, account open.
    const recoveredAccount = await request(USER_IDS.purgeRecovered, 'soft_deleted', past, past);

    const ready = (await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id);

    expect(ready).toContain(deletedAccount);
    expect(ready).not.toContain(recoveredAccount);
  });

  // A stranded soft_deleted request (old purge date) on an account that is
  // later deleted again: the cron run that re-deletes it sets users.deleted_at
  // in phase 1, and phase 2 must not then purge the stranded row at once.
  it('does not purge a re-deleted account until its NEW deletion has had the full window', async () => {
    const userId = USER_IDS.purgeRedeleted;
    const longAgo = new Date(Date.now() - 8 * MONTH);
    const stranded = await request(userId, 'soft_deleted', longAgo, new Date(Date.now() - 2 * MONTH));
    // The new deletion, made by tonight's phase 1.
    await markUserDeleted(userId, new Date());
    await request(userId, 'soft_deleted', new Date(Date.now() - DAY), new Date(Date.now() + 6 * MONTH));

    const ready = (await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id);

    expect(ready).not.toContain(stranded);
  });

  // The cron's candidate list can be stale: an operator recovers the account
  // between the scan and the purge loop.
  it('purges nothing when the account is recovered between the candidate scan and the purge', async () => {
    const userId = USER_IDS.purgeRace;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);
    expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).toContain(id);

    // The whole recovery: claim, then restore.
    expect(await recoveryClaim(id)).toBe(true);
    await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId));

    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('recovered');
    await expectUntouched('purgeRace');
  });

  // The account is deleted (long enough ago), so the users-row condition alone
  // would let these through. Only the claim on the REQUEST stops them.
  it('skips a request that is no longer soft_deleted, though its account is deleted', async () => {
    const userId = USER_IDS.purgeNotSoftDeleted;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'recovered', past, past);

    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('recovered');
    await expectUntouched('purgeNotSoftDeleted');
  });

  it("skips while the account's current deletion is younger than the purge delay", async () => {
    const userId = USER_IDS.purgeTooRecent;
    // A stranded row with an old purge date; the account was deleted again today.
    await markUserDeleted(userId, new Date());
    const id = await request(userId, 'soft_deleted', new Date(Date.now() - 8 * MONTH), new Date(Date.now() - 2 * MONTH));

    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('soft_deleted');
    await expectUntouched('purgeTooRecent');
  });

  // ── The lock: whoever moves the request out of soft_deleted first wins ────

  // Recovery claimed the request but has not restored the account yet (its
  // users.deleted_at is still set), and the purge runs in that gap.
  it('a purge loses to a recovery that claimed first, even before the account is restored', async () => {
    const userId = USER_IDS.lockRecoveryFirst;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);

    expect(await recoveryClaim(id)).toBe(true);
    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('recovered');
    await expectUntouched('lockRecoveryFirst');
  });

  // Interleaving A: the purge runs to completion between the recovery's read
  // and its writes. With the claim, the recovery matches nothing (409).
  it('a recovery loses to a purge that claimed first', async () => {
    const userId = USER_IDS.lockPurgeFirst;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);

    const purged = await purgeUserPII(id);

    expect(purged?.purgedAt).toBeInstanceOf(Date);
    expect(await recoveryClaim(id)).toBe(false);
    expect(await statusOf(id)).toBe('purged');
  });

  // Interleaving B, and the retry window: the purge claimed and scrubbed, then
  // the auth rewrite failed. Until a later run finishes it, the request reads
  // `purged` with a null purged_at, and a recovery must refuse.
  it('refuses recovery while a crashed purge awaits its retry, then the retry finishes it', async () => {
    const userId = USER_IDS.lockCrashedPurge;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);

    failNextAuthUpdateUserFor(userId);
    await expect(purgeUserPII(id)).rejects.toThrow(/Failed to scrub auth user/);
    expect(await statusOf(id)).toBe('purged');
    const [scrubbed] = await db.select().from(users).where(eq(users.id, userId));
    expect(scrubbed!.email).toBe(`deleted-${userId}@redacted`);

    expect(await recoveryClaim(id)).toBe(false);

    // The next run picks the claimed, unfinished request up again.
    expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).toContain(id);
    const finished = await purgeUserPII(id);
    expect(finished?.purgedAt).toBeInstanceOf(Date);
    expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).not.toContain(id);
  });

  // The users scrub's own guard (`deleted_at is not null`), reached for real:
  // the account is reopened by another session after the purge's claim and
  // before its scrub. A transaction holding the users row makes the scrub wait
  // until the reopening commits.
  it('releases its claim and scrubs nothing when the account is reopened after the claim', async () => {
    const userId = USER_IDS.reopenedAfterClaim;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);

    let purge: Promise<unknown> = Promise.resolve();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ deletedAt: null }).where(eq(users.id, userId));
      purge = purgeUserPII(id);
      // The claim reads the committed row (still deleted) and lands; the scrub
      // then blocks on this transaction's row lock.
      await waitFor(async () => (await statusOf(id)) === 'purged');
    });

    await expect(purge).resolves.toBeNull();
    expect(await statusOf(id)).toBe('soft_deleted');
    await expectUntouched('reopenedAfterClaim');
  });

  // A user missing from auth.users has nothing left to scrub there; the purge
  // used to fail on it every night forever.
  it('finishes the purge when the auth user no longer exists', async () => {
    const userId = USER_IDS.authMissing;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);
    failNextAuthUpdateUserFor(userId, { status: 404, code: 'user_not_found', message: 'User not found' });

    const finished = await purgeUserPII(id);

    expect(finished?.purgedAt).toBeInstanceOf(Date);
  });

  // ── Community requests take the same lock ─────────────────────────────────

  it('a community purge loses to a recovery that claimed first', async () => {
    const past = new Date(Date.now() - DAY);
    const id = await communityRequest('soft_deleted', past);

    expect(await recoveryClaim(id)).toBe(true);
    await expect(purgeCommunityData(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('recovered');
  });

  it('never purges a community that is no longer deleted', async () => {
    const past = new Date(Date.now() - DAY);
    const id = await communityRequest('soft_deleted', past);
    await db.update(communities).set({ deletedAt: null }).where(eq(communities.id, communityId));

    expect((await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id)).not.toContain(id);
    await expect(purgeCommunityData(id)).resolves.toBeNull();
    expect(await statusOf(id)).toBe('soft_deleted');

    await db.update(communities).set({ deletedAt: new Date(Date.now() - 7 * MONTH) }).where(eq(communities.id, communityId));
  });
});
