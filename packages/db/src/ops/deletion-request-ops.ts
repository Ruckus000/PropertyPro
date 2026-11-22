/**
 * Deletion requests: the platform-admin recovery and the cooling-period
 * cancellation (intervene), as database transactions.
 *
 * Shared by apps/admin (the recover and intervene routes) and apps/web (the
 * community-cancel route, and the integration suite that drives these against
 * a real Postgres). Exposed only through `@propertypro/db/unsafe`.
 *
 * ## The lock
 *
 * A deletion request's `status` is the lock between recovery and purge, and
 * whoever moves a request out of `soft_deleted` first wins. The purge (apps/web
 * `account-lifecycle-service.ts`) claims `soft_deleted` → `purged` with
 * `purged_at` null and sets `purged_at` last. A recovery claims `soft_deleted`
 * → `recovered` with `recovered_at` null and sets `recovered_at` last.
 *
 * So `recovered` with a null `recovered_at` means "a recovery claimed this and
 * has not finished": it crashed, or it is running now. The purge never matches
 * it (the account sits safely deleted, not purged), the admin Dashboard shows it
 * as an unfinished recovery, and `claimDeletionRecoveryOp` lets the recovery be
 * retried from it. Rows recovered before this marker existed all carry a
 * `recovered_at`, so none of them reads as unfinished.
 *
 * ## The target
 *
 * A request's target is a user (`request_type = 'user'`) or a community. A
 * target can carry several requests (legacy duplicates, or a stale row left by
 * an earlier recovery). Recovery and intervene act on ALL of the target's
 * requests, never on the chosen one alone: a duplicate left `cooling` deletes
 * the restored target again, and one left `soft_deleted` is purged if the
 * target is ever deleted again.
 *
 * ## Lock order
 *
 * Each transaction locks the target's request rows (ordered by id) before the
 * target's `users` / `communities` row. The lifecycle cron's soft delete and
 * purge take the same order (request rows, then the target row), so they wait
 * on each other rather than deadlock.
 */
import { and, eq, inArray, isNull, notLike, sql } from 'drizzle-orm';
import { db } from '../drizzle';
import { accountDeletionRequests } from '../schema/account-deletion-requests';
import { communities } from '../schema/communities';
import { users } from '../schema/users';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DeletionRequestRecord = typeof accountDeletionRequests.$inferSelect;

/**
 * How long after a soft delete a recovery is refused.
 *
 * The cron's soft delete commits, THEN bans the sign-in in Supabase Auth, a
 * separate HTTP call per user. A recovery that lifted the ban in that gap would
 * have the cron's ban land on the restored account. The cron is a Vercel
 * function with no `maxDuration` of its own (the platform default is 300 s, and
 * no plan allows more than 800 s), and `users.deleted_at` is stamped before its
 * transaction, so its ban call has run, or the function has died, well inside
 * this window.
 */
export const RECOVERY_SOFT_DELETE_SETTLE_MS = 15 * 60 * 1000;

/** The scrubbed address the purge writes into `users.email`. */
const SCRUBBED_EMAIL_PATTERN = '%@redacted';

function isScrubbedEmail(email: string): boolean {
  return email.endsWith('@redacted');
}

/** SQL: every request of the same target as `row` (including `row`). */
function sameTarget(row: Pick<DeletionRequestRecord, 'requestType' | 'userId' | 'communityId'>) {
  if (row.requestType === 'community') {
    return row.communityId === null
      ? // The community row is gone (`community_id` is ON DELETE SET NULL), so
        // nothing ties this request to any other.
        sql`false`
      : and(
          eq(accountDeletionRequests.requestType, 'community'),
          eq(accountDeletionRequests.communityId, row.communityId),
        );
  }
  return and(
    eq(accountDeletionRequests.requestType, 'user'),
    eq(accountDeletionRequests.userId, row.userId),
  );
}

/**
 * Locks every request of the chosen request's target, by id, and returns them
 * with the chosen one. `chosen` is undefined when no request has this id.
 */
async function lockTargetRequests(tx: Tx, requestId: number) {
  const [peek] = await tx
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId));
  if (!peek) return { chosen: undefined, rows: [] as DeletionRequestRecord[] };

  const rows = await tx
    .select()
    .from(accountDeletionRequests)
    .where(sql`${accountDeletionRequests.id} = ${requestId} or ${sameTarget(peek)}`)
    .orderBy(accountDeletionRequests.id)
    .for('update');
  return { chosen: rows.find((r) => r.id === requestId), rows };
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export type DeletionRecoveryClaim =
  /** No request has this id. */
  | { outcome: 'not_found' }
  /** The request is not recoverable: still cooling, cancelled, or a recovery that finished. */
  | { outcome: 'not_recoverable'; request: DeletionRequestRecord }
  /** A purge claimed this target (finished, or in flight and retried nightly). */
  | { outcome: 'purged'; request: DeletionRequestRecord }
  /**
   * The target is not deleted: this `soft_deleted` row was left behind by an
   * earlier recovery or a released claim. Nothing was written, so a newer
   * live request (the user asking again) is left alone.
   */
  | { outcome: 'stale'; request: DeletionRequestRecord }
  /** The community row no longer exists. */
  | { outcome: 'target_missing'; request: DeletionRequestRecord }
  /** Soft-deleted under `RECOVERY_SOFT_DELETE_SETTLE_MS` ago; try again later. */
  | { outcome: 'too_recent'; request: DeletionRequestRecord; retryAfter: Date }
  /**
   * A user's requests are claimed and still deleted. The caller lifts the
   * sign-in ban, then calls `finishUserRecoveryOp`, or on failure
   * `releaseUserRecoveryOp`.
   */
  | {
      outcome: 'claimed';
      request: DeletionRequestRecord;
      userId: string;
      claimedRequestIds: number[];
      cancelledRequestIds: number[];
      /** True when this retried a recovery that had been claimed and not finished. */
      resumed: boolean;
    }
  /** A community: claimed, restored and finished in this one transaction. */
  | {
      outcome: 'recovered';
      request: DeletionRequestRecord;
      communityId: number;
      claimedRequestIds: number[];
      cancelledRequestIds: number[];
      resumed: boolean;
    };

/**
 * The recovery's claim, in one transaction.
 *
 * The chosen request must be `soft_deleted`, or `recovered` with a null
 * `recovered_at` (an unfinished recovery, resumed). Then, for its target:
 * - any `purged` request refuses the whole recovery (the data may be gone);
 * - a fresh claim requires the target to be deleted now (else `stale`);
 * - a user soft-deleted too recently is refused (`too_recent`);
 * - every `cooling` request is cancelled, every `soft_deleted` one claimed.
 *
 * A community is then restored and its claimed requests finished in the same
 * transaction, so a community recovery cannot stop half way. A user's restore
 * waits for the caller to lift the auth ban (an HTTP call that cannot join the
 * transaction): see `finishUserRecoveryOp`.
 */
export async function claimDeletionRecoveryOp(
  requestId: number,
  params: { adminUserId: string; now?: Date },
): Promise<DeletionRecoveryClaim> {
  const now = params.now ?? new Date();

  return db.transaction(async (tx): Promise<DeletionRecoveryClaim> => {
    const { chosen, rows } = await lockTargetRequests(tx, requestId);
    if (!chosen) return { outcome: 'not_found' };

    const resumed = chosen.status === 'recovered' && chosen.recoveredAt === null;
    if (chosen.status === 'purged' || rows.some((r) => r.status === 'purged')) {
      return { outcome: 'purged', request: chosen };
    }
    if (chosen.status !== 'soft_deleted' && !resumed) {
      return { outcome: 'not_recoverable', request: chosen };
    }

    let deletedAt: Date | null;
    if (chosen.requestType === 'community') {
      if (chosen.communityId === null) return { outcome: 'target_missing', request: chosen };
      const [community] = await tx
        .select({ deletedAt: communities.deletedAt })
        .from(communities)
        .where(eq(communities.id, chosen.communityId))
        .for('update');
      if (!community) return { outcome: 'target_missing', request: chosen };
      deletedAt = community.deletedAt;
    } else {
      const [user] = await tx
        .select({ deletedAt: users.deletedAt, email: users.email })
        .from(users)
        .where(eq(users.id, chosen.userId))
        .for('update');
      if (!user) return { outcome: 'target_missing', request: chosen };
      // Scrubbed by a purge whose request row is no longer `purged` (repaired
      // by hand): there is nothing left to restore.
      if (isScrubbedEmail(user.email)) return { outcome: 'purged', request: chosen };
      deletedAt = user.deletedAt;
      if (deletedAt !== null && now.getTime() - deletedAt.getTime() < RECOVERY_SOFT_DELETE_SETTLE_MS) {
        return {
          outcome: 'too_recent',
          request: chosen,
          retryAfter: new Date(deletedAt.getTime() + RECOVERY_SOFT_DELETE_SETTLE_MS),
        };
      }
    }
    // A resumed recovery may already have restored the target; a fresh one
    // must find it deleted, or the row is stale.
    if (deletedAt === null && !resumed) return { outcome: 'stale', request: chosen };

    const target = sameTarget(chosen);
    const cancelled = await tx
      .update(accountDeletionRequests)
      .set({ status: 'cancelled', cancelledAt: now, cancelledBy: params.adminUserId })
      .where(and(target, eq(accountDeletionRequests.status, 'cooling')))
      .returning({ id: accountDeletionRequests.id });
    await tx
      .update(accountDeletionRequests)
      .set({ status: 'recovered', recoveredAt: null })
      .where(and(target, eq(accountDeletionRequests.status, 'soft_deleted')));
    const claimed = await tx
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(
        and(
          target,
          eq(accountDeletionRequests.status, 'recovered'),
          isNull(accountDeletionRequests.recoveredAt),
        ),
      )
      .orderBy(accountDeletionRequests.id);
    const claimedRequestIds = claimed.map((r) => r.id);
    const cancelledRequestIds = cancelled.map((r) => r.id).sort((a, b) => a - b);

    if (chosen.requestType === 'community') {
      const communityId = chosen.communityId!;
      await tx.update(communities).set({ deletedAt: null }).where(eq(communities.id, communityId));
      await tx
        .update(accountDeletionRequests)
        .set({ recoveredAt: now })
        .where(inArray(accountDeletionRequests.id, claimedRequestIds));
      return {
        outcome: 'recovered',
        request: { ...chosen, status: 'recovered', recoveredAt: now },
        communityId,
        claimedRequestIds,
        cancelledRequestIds,
        resumed,
      };
    }

    return {
      outcome: 'claimed',
      request: { ...chosen, status: 'recovered', recoveredAt: null },
      userId: chosen.userId,
      claimedRequestIds,
      cancelledRequestIds,
      resumed,
    };
  });
}

/**
 * Finishes a user's recovery, in one transaction: clears `users.deleted_at`
 * and stamps `recovered_at` on every claimed, unfinished request of the user.
 *
 * Call it only after the sign-in ban is lifted. Restoring first would leave,
 * on an unban failure, an account that is neither deleted nor purgeable and
 * still cannot sign in; this way a failure before here leaves it deleted and
 * claimed, which a retry resumes.
 *
 * The restore is conditional on the row being unscrubbed. The claim already
 * refused a target with any purged request, so this is a second line, not the
 * arbiter: `purged` here means a purge reached the row by a path the claim
 * did not see, and nothing is written.
 */
export async function finishUserRecoveryOp(
  userId: string,
  params: { now?: Date } = {},
): Promise<{ outcome: 'recovered'; finishedRequestIds: number[] } | { outcome: 'purged' }> {
  const now = params.now ?? new Date();
  return db.transaction(async (tx) => {
    // Request rows first, then `users`: the lock order every other deletion
    // transaction takes (see the file header). Restoring first would hold the
    // users row while waiting on a request row a concurrent resumed claim holds.
    const unfinished = and(
      eq(accountDeletionRequests.requestType, 'user'),
      eq(accountDeletionRequests.userId, userId),
      eq(accountDeletionRequests.status, 'recovered'),
      isNull(accountDeletionRequests.recoveredAt),
    );
    await tx
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(unfinished)
      .orderBy(accountDeletionRequests.id)
      .for('update');

    const restored = await tx
      .update(users)
      .set({ deletedAt: null })
      .where(and(eq(users.id, userId), notLike(users.email, SCRUBBED_EMAIL_PATTERN)))
      .returning({ id: users.id });
    if (restored.length === 0) return { outcome: 'purged' as const };

    const finished = await tx
      .update(accountDeletionRequests)
      .set({ recoveredAt: now })
      .where(unfinished)
      .returning({ id: accountDeletionRequests.id });
    return {
      outcome: 'recovered' as const,
      finishedRequestIds: finished.map((r) => r.id).sort((a, b) => a - b),
    };
  });
}

/**
 * Gives back a user recovery's claim when lifting the ban failed, so the
 * account reads deleted and purgeable again: `recovered` (unfinished) →
 * `soft_deleted` for exactly the ids claimed. Requests the claim cancelled stay
 * cancelled. Returns how many it gave back.
 *
 * Call it only once the sign-in ban is known to be ON. A failed unban can
 * still have landed, and an earlier attempt of a resumed recovery may have
 * lifted it, so the caller re-applies the ban first; releasing an unbanned
 * account would leave it purgeable while its owner can still sign in.
 */
export async function releaseUserRecoveryOp(
  userId: string,
  claimedRequestIds: number[],
): Promise<number> {
  if (claimedRequestIds.length === 0) return 0;
  const released = await db
    .update(accountDeletionRequests)
    .set({ status: 'soft_deleted' })
    .where(
      and(
        inArray(accountDeletionRequests.id, claimedRequestIds),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.status, 'recovered'),
        isNull(accountDeletionRequests.recoveredAt),
      ),
    )
    .returning({ id: accountDeletionRequests.id });
  return released.length;
}

// ---------------------------------------------------------------------------
// Intervene: cancel during the cooling period
// ---------------------------------------------------------------------------

export type DeletionInterveneResult =
  | { outcome: 'not_found' }
  /** The chosen request is no longer `cooling` (cancelled, or the cron soft-deleted it). */
  | { outcome: 'not_cooling'; request: DeletionRequestRecord }
  /**
   * The chosen request is still `cooling` but its target is already deleted,
   * through another request (a legacy duplicate). Cancelling would report the
   * target open while it stays deleted; recovering it is the operator's move.
   */
  | { outcome: 'target_deleted'; request: DeletionRequestRecord }
  | { outcome: 'cancelled'; request: DeletionRequestRecord; cancelledRequestIds: number[] };

/**
 * Cancels the chosen `cooling` request and every other `cooling` request of
 * the same target, in one transaction. `notes` is stored on each cancelled row.
 */
export async function interveneDeletionRequestOp(
  requestId: number,
  params: { cancelledBy: string; notes: string | null; now?: Date },
): Promise<DeletionInterveneResult> {
  const now = params.now ?? new Date();
  return db.transaction(async (tx): Promise<DeletionInterveneResult> => {
    const { chosen } = await lockTargetRequests(tx, requestId);
    if (!chosen) return { outcome: 'not_found' };
    if (chosen.status !== 'cooling') return { outcome: 'not_cooling', request: chosen };

    let targetDeleted = false;
    if (chosen.requestType === 'community') {
      if (chosen.communityId !== null) {
        const [community] = await tx
          .select({ deletedAt: communities.deletedAt })
          .from(communities)
          .where(eq(communities.id, chosen.communityId));
        targetDeleted = community?.deletedAt != null;
      }
    } else {
      const [user] = await tx
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, chosen.userId));
      targetDeleted = user?.deletedAt != null;
    }
    if (targetDeleted) return { outcome: 'target_deleted', request: chosen };

    const cancelled = await tx
      .update(accountDeletionRequests)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: params.cancelledBy,
        interventionNotes: params.notes,
      })
      .where(
        and(
          sql`(${accountDeletionRequests.id} = ${requestId} or ${sameTarget(chosen)})`,
          eq(accountDeletionRequests.status, 'cooling'),
        ),
      )
      .returning();
    const updated = cancelled.find((r) => r.id === requestId)!;
    return {
      outcome: 'cancelled',
      request: updated,
      cancelledRequestIds: cancelled.map((r) => r.id).sort((a, b) => a - b),
    };
  });
}
