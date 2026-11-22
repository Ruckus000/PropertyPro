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
 * `purgeUserPII` re-checks before scrubbing, so a recovery that lands after
 * the candidate scan leaves the account untouched.
 *
 * Inserts run-unique users rows and their requests directly; afterAll deletes
 * them (requests first: `user_id` is ON DELETE RESTRICT).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { accountDeletionRequests, users } from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
// AUTHZ: Integration test for platform-level tables (users, account_deletion_requests; no community_id).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  cancelUserDeletion,
  findPurgeReadyDeletionRequests,
  purgeUserPII,
} from '../../src/lib/services/account-lifecycle-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

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
  purgeRaceUserOnly: randomUUID(),
  purgeNotSoftDeleted: randomUUID(),
  purgeTooRecent: randomUUID(),
};
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

  beforeAll(async () => {
    await db.insert(users).values(
      (Object.keys(USER_IDS) as Label[]).map((label) => ({
        id: USER_IDS[label],
        email: emailOf(label),
        fullName: `Deletion ${label}`,
      })),
    );
  });

  afterAll(async () => {
    const ids = Object.values(USER_IDS);
    await db.delete(accountDeletionRequests).where(inArray(accountDeletionRequests.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
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

    // The recovery: request recovered, users.deleted_at cleared.
    await db
      .update(accountDeletionRequests)
      .set({ status: 'recovered', recoveredAt: new Date() })
      .where(eq(accountDeletionRequests.id, id));
    await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId));

    // Returns before the auth.users rewrite (there is no Auth service here, so
    // reaching it would throw).
    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('recovered');
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.email).toBe(emailOf('purgeRace'));
    expect(user!.fullName).toBe('Deletion purgeRace');
  });

  // The account is deleted (long enough ago), so the users-row condition alone
  // would let these through. Only the re-check of the REQUEST stops them.
  it('skips a request that is no longer soft_deleted, though its account is deleted', async () => {
    const userId = USER_IDS.purgeNotSoftDeleted;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'recovered', past, past);

    await expect(purgeUserPII(id)).resolves.toBeNull();

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.email).toBe(emailOf('purgeNotSoftDeleted'));
  });

  it("skips while the account's current deletion is younger than the purge delay", async () => {
    const userId = USER_IDS.purgeTooRecent;
    // A stranded row with an old purge date; the account was deleted again today.
    await markUserDeleted(userId, new Date());
    const id = await request(userId, 'soft_deleted', new Date(Date.now() - 8 * MONTH), new Date(Date.now() - 2 * MONTH));

    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('soft_deleted');
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.email).toBe(emailOf('purgeTooRecent'));
  });

  // Same race, one step later: the request is still soft_deleted but the
  // account was restored. The users scrub is conditional on deleted_at.
  it('scrubs nothing when only the users row was restored', async () => {
    const userId = USER_IDS.purgeRaceUserOnly;
    const past = new Date(Date.now() - DAY);
    await markUserDeleted(userId, new Date(Date.now() - 7 * MONTH));
    const id = await request(userId, 'soft_deleted', past, past);
    await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId));

    await expect(purgeUserPII(id)).resolves.toBeNull();

    expect(await statusOf(id)).toBe('soft_deleted');
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.email).toBe(emailOf('purgeRaceUserOnly'));
  });
});
