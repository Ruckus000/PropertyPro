/**
 * `cancelUserDeletion` against a real database. Its guards are SQL (the
 * `status = 'cooling'` predicate and a `not exists` on the account's state),
 * so a mocked query builder can only check their shape, not that Postgres
 * applies them.
 *
 * - every cooling request the user has is cancelled, not one of them;
 * - a second cancel of the same request reports `already_cancelled`;
 * - once the ACCOUNT is deleted (a soft-deleted sibling request, or
 *   `users.deleted_at`), nothing is cancelled and the outcome is `too_late`.
 *   The legacy duplicate case: the cron soft-deleted the earlier request while
 *   a later one is still cooling.
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
import { cancelUserDeletion } from '../../src/lib/services/account-lifecycle-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('account-deletion-cancel');
const describeDb = getDescribeDb();

const USER_IDS = {
  twoCooling: randomUUID(),
  concurrent: randomUUID(),
  duplicateAfterCron: randomUUID(),
  usersRowDeleted: randomUUID(),
};
const DAY = 24 * 60 * 60 * 1000;

describeDb('cancelUserDeletion (integration)', () => {
  const db = createUnscopedClient();

  async function request(userId: string, status: string, coolingEndsAt: Date): Promise<number> {
    const [row] = await db
      .insert(accountDeletionRequests)
      .values({ requestType: 'user', userId, status, coolingEndsAt })
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

  beforeAll(async () => {
    await db.insert(users).values(
      Object.entries(USER_IDS).map(([label, id]) => ({
        id,
        email: `deletion-cancel-${label}-${id}@lifecycletest.invalid`,
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

  it('refuses once a sibling request was soft-deleted, leaving the cooling one untouched', async () => {
    const userId = USER_IDS.duplicateAfterCron;
    // The cron soft-deleted the earlier request; the later one has not expired.
    await request(userId, 'soft_deleted', new Date(Date.now() - DAY));
    const later = await request(userId, 'cooling', new Date(Date.now() + DAY));

    const result = await cancelUserDeletion(userId, userId, later);

    expect(result).toEqual({ outcome: 'too_late', status: 'cooling' });
    expect(await statusOf(later)).toBe('cooling');
  });

  it('refuses when the users row is already soft-deleted', async () => {
    const userId = USER_IDS.usersRowDeleted;
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    const id = await request(userId, 'cooling', new Date(Date.now() + DAY));

    const result = await cancelUserDeletion(userId, userId, id);

    expect(result).toEqual({ outcome: 'too_late', status: 'cooling' });
    expect(await statusOf(id)).toBe('cooling');
  });
});
