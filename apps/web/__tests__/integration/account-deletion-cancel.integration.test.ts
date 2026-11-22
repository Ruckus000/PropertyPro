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
 * `findPurgeReadyDeletionRequests` never returns a user request whose account
 * is not deleted, so a stranded `soft_deleted` row cannot purge an open account.
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
};
const DAY = 24 * 60 * 60 * 1000;

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

  const markUserDeleted = (userId: string) =>
    db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));

  beforeAll(async () => {
    await db.insert(users).values(
      Object.entries(USER_IDS).map(([label, id]) => ({
        id,
        email: `deletion-guards-${label}-${id}@lifecycletest.invalid`,
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
    await markUserDeleted(USER_IDS.purgeDeleted);
    const deletedAccount = await request(USER_IDS.purgeDeleted, 'soft_deleted', past, past);
    // Stranded by an old recovery: soft_deleted, purge date passed, account open.
    const recoveredAccount = await request(USER_IDS.purgeRecovered, 'soft_deleted', past, past);

    const ready = (await findPurgeReadyDeletionRequests(new Date())).map((r) => r.id);

    expect(ready).toContain(deletedAccount);
    expect(ready).not.toContain(recoveredAccount);
  });
});
