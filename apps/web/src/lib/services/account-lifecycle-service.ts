/**
 * Account Lifecycle Service
 *
 * Owns all lifecycle state machines for free access plans and account
 * deletion workflows. Uses `createUnscopedClient()` because access_plans
 * and account_deletion_requests are platform-level tables (not tenant-scoped).
 *
 * Free access status is computed (never stored) to avoid drift:
 *   revokedAt set   -> 'revoked'
 *   convertedAt set -> 'converted'
 *   now < expiresAt -> 'active'
 *   now < graceEndsAt -> 'in_grace'
 *   else -> 'expired'
 *
 * Deletion state machine:
 *   cooling -> soft_deleted -> purged
 *   cooling -> cancelled
 *   soft_deleted -> recovered
 */
import { eq, and, asc, desc, inArray, isNull, isNotNull, lt, sql } from '@propertypro/db/filters';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';
import {
  accessPlans,
  communities,
  communityExportJobs,
  users,
  userRoles,
  accountDeletionRequests,
  visitorLog,
  logAuditEvent,
} from '@propertypro/db';
import type { AccessPlan } from '@propertypro/db';
// AUTHZ: Account lifecycle: platform-level access plans + deletion workflows (no community_id scoping); interveneDeletionRequestOp is reached only through interveneCommunityDeletion, whose caller passes a request looked up by its own community after requireRootManager
import { createUnscopedClient, interveneDeletionRequestOp } from '@propertypro/db/unsafe';
// AUTHZ: GoTrue admin updateUserById to ban/unban/scrub accounts in the deletion lifecycle; called by the gated account routes and the lifecycle cron
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { captureMessage } from '@sentry/nextjs';
import { ConflictError } from '@/lib/api/errors/ConflictError';
import { purgeCommunityAdminAssets, purgeCommunitySiteAssets } from '@/lib/site-assets/cleanup';
import { purgeCommunityExportArchives } from '@/lib/services/export/purge-export-archives';
import { revokeVisitorPassesForUser } from '@/lib/services/package-visitor-service';
import {
  findRootOffboardingImpact,
  type RootOffboardingCommunity,
} from '@/lib/account-lifecycle/root-offboarding';
import { onePerUser } from '@/lib/account-lifecycle/one-per-user';
import {
  deletionCoolingEndsAt,
  deletionPurgeAt,
  deletionPurgeCutoff,
} from '@/lib/account-lifecycle/deletion-timeline';

/** GoTrue ban duration for a deleted account (~100 years). 'none' lifts a ban. */
const PERMANENT_BAN = '876600h';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessPlanStatus = 'revoked' | 'converted' | 'active' | 'in_grace' | 'expired';

// ---------------------------------------------------------------------------
// Free Access — Status Computation
// ---------------------------------------------------------------------------

/**
 * Pure function: derives the current status of an access plan from timestamps.
 * Status is never stored in the DB to avoid drift.
 */
export function computeAccessPlanStatus(plan: {
  revokedAt: Date | null;
  convertedAt: Date | null;
  expiresAt: Date;
  graceEndsAt: Date;
}): AccessPlanStatus {
  if (plan.revokedAt) return 'revoked';
  if (plan.convertedAt) return 'converted';
  const now = new Date();
  if (now < plan.expiresAt) return 'active';
  if (now < plan.graceEndsAt) return 'in_grace';
  return 'expired';
}

// ---------------------------------------------------------------------------
// Deletion Requests — Lookup
// ---------------------------------------------------------------------------

export interface UserActiveDeletionRequest {
  id: number;
  status: string;
  coolingEndsAt: Date;
  createdAt: Date;
}

/**
 * Return the user's most recent `request_type='user'` deletion request,
 * regardless of status — or `null` if none exists. The caller is responsible
 * for filtering out terminal statuses (`cancelled` / `recovered`) when
 * surfacing "is there an active request?" to the UI; this matches the
 * pre-A3 route's behavior.
 *
 * AUTHZ: cross-tenant read of platform-level table; safe for the user to
 * query their own row by `userId`.
 */
export async function getLatestUserDeletionRequest(
  userId: string,
): Promise<UserActiveDeletionRequest | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      coolingEndsAt: accountDeletionRequests.coolingEndsAt,
      createdAt: accountDeletionRequests.createdAt,
    })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
      ),
    )
    .orderBy(desc(accountDeletionRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Find the active `cooling` community-deletion request for a community,
 * if any. Returns the request id or `null`. Used by the community-cancel
 * deletion path.
 *
 * AUTHZ: cross-tenant read of platform-level table; safe because the lookup
 * is scoped by `communityId` (the caller has already verified
 * `requirePermission(membership, 'settings', 'write')`).
 */
export async function findCoolingCommunityDeletionRequest(
  communityId: number,
): Promise<number | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.communityId, communityId),
        eq(accountDeletionRequests.requestType, 'community'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Every `cooling` deletion request the user has, ordered the way the lifecycle
 * cron reaches them (earliest `coolingEndsAt`, then id). The cancel route
 * passes the first to `cancelUserDeletion`, which cancels all of them, and a
 * support session's audit row names the whole list before the cancel runs.
 *
 * The order only matters for a lookup made BEFORE the cron runs. Once a
 * sibling is soft-deleted the first is a later one, which is why
 * `cancelUserDeletion` refuses on the account's state, not this row's.
 *
 * AUTHZ: cross-tenant read of platform-level table; safe for the user to
 * query their own rows by `userId`.
 */
export async function findCoolingDeletionRequestIdsForUser(userId: string): Promise<number[]> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    )
    .orderBy(asc(accountDeletionRequests.coolingEndsAt), asc(accountDeletionRequests.id));
  return rows.map((r) => r.id);
}

/**
 * Find the active access plan id for a community, if any.
 * "Active" = not revoked AND not yet converted (status 'active' or 'in_grace'
 * — used by the subscribe flow to attach the plan id to the Stripe checkout
 * metadata so the webhook can mark it converted).
 *
 * Returns the plan id or `null`.
 *
 * AUTHZ: cross-tenant unscoped read of platform-level table. Caller MUST
 * authorize via the appropriate community-membership + permission checks
 * before invoking.
 */
export async function findActiveAccessPlanIdForCommunity(
  communityId: number,
): Promise<number | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ id: accessPlans.id })
    .from(accessPlans)
    .where(
      and(
        eq(accessPlans.communityId, communityId),
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Deletion — User
// ---------------------------------------------------------------------------

/**
 * Thrown when the requester holds `root_manager` somewhere and has not yet
 * acknowledged that deleting their account leaves those communities without a
 * root. Carries the impacted communities so the caller can name them.
 *
 * Deliberately an ACK, not a refusal (R3-03b / issue #924): account deletion is
 * self-scoped and must stay self-service for erasure requests, so the user is
 * informed and consents rather than being blocked. Mirrors the
 * `NonOwnerAckRequiredError` precedent in role-management-service.
 */
export class RootOffboardingAckRequiredError extends Error {
  constructor(public readonly communities: RootOffboardingCommunity[]) {
    super('Root-offboarding acknowledgement required.');
    this.name = 'RootOffboardingAckRequiredError';
  }
}

/**
 * Creates a deletion request with a 30-day cooling period, or returns the one
 * the user already has.
 *
 * One cooling request per user: a second call (two tabs, a retry after a slow
 * response) returns the existing request with `created: false` and writes
 * nothing, so the caller must not send a second "initiated" email.
 *
 * Throws `RootOffboardingAckRequiredError` when the user is root of any
 * community and `acknowledgeRootOffboarding` is false. NOTHING is written in
 * that case — the check runs before the insert, so a user who bails at the
 * confirmation prompt does not leave a stray cooling request behind.
 */
export async function requestUserDeletion(
  userId: string,
  acknowledgeRootOffboarding = false,
) {
  const now = new Date();
  const coolingEndsAt = deletionCoolingEndsAt(now);
  const db = createUnscopedClient();

  // Nothing is written on this path, so it needs no root acknowledgement: the
  // request returned here was acknowledged (or needed none) when it was made.
  // ponytail: check-then-insert with no unique index, so two calls that both
  // read before either inserts still create two rows (cancel stops them all).
  // Trigger: two cooling rows for one user observed in prod; then add a partial
  // unique index on (user_id) where request_type = 'user' and status = 'cooling'.
  const existing = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    );
  const [earliest] = [...existing].sort((a, b) => a.id - b.id);
  if (earliest) return { request: earliest, created: false };

  // Ack gate BEFORE any write. Unlike the flagging below, a failure here must
  // propagate: if we cannot determine the impact we must not silently proceed
  // to delete a root's account as though there were none.
  const rootImpact = await findRootOffboardingImpact(userId);
  if (rootImpact.length > 0 && !acknowledgeRootOffboarding) {
    throw new RootOffboardingAckRequiredError(rootImpact);
  }

  const [request] = await db
    .insert(accountDeletionRequests)
    .values({
      requestType: 'user',
      userId,
      status: 'cooling',
      coolingEndsAt,
    })
    .returning();

  if (!request) throw new Error(`Failed to create deletion request for user ${userId}`);

  // Role-offboarding flag: record which communities this leaves rootless so the
  // platform-admin surface (rootless-communities report) and the audit trail
  // have visibility. Reuses the impact computed for the ack gate above — no
  // second query, and the audit cannot disagree with what the user consented to.
  //
  // Communities with NO successor get a distinct action. Those have no
  // self-service recovery at all (`reassignRootOp` requires the target to
  // already be a property_manager), so they need a two-step platform-admin
  // break-glass and must not be buried among the recoverable ones.
  try {
    for (const { communityId, name, hasSuccessor } of rootImpact) {
      // eslint-disable-next-line no-console
      console.warn(
        `[root-offboarding] user ${userId} (deletion request ${request.id}) is root_manager of community ${communityId} (${name}); community will be rootless after purge${
          hasSuccessor ? '' : ' with NO property_manager able to claim it'
        }`,
      );
      await logAuditEvent({
        userId,
        action: hasSuccessor
          ? 'root_pending_deletion'
          : 'root_pending_deletion_no_successor',
        resourceType: 'account_deletion_request',
        resourceId: String(request.id),
        communityId,
        metadata: {
          reason: 'root_manager_requested_account_deletion',
          coolingEndsAt: coolingEndsAt.toISOString(),
          communityName: name,
          hasSuccessor,
        },
      });
    }
  } catch (err) {
    // Still best-effort: the request is already committed and the user has
    // explicitly consented, so a logging failure must not surface as an error
    // to them. The ack gate above is the part that must not be swallowed, and
    // it runs before this block precisely so it cannot be.
    // eslint-disable-next-line no-console
    console.error('[root-offboarding] failed to flag rootless-on-deletion', err);
  }

  return { request, created: true };
}

/**
 * Cancels EVERY cooling deletion request the user has. Cancelling only one
 * would leave a duplicate to soft-delete the account after the user was told
 * it stays open.
 *
 * Two guards, both in the UPDATE itself:
 * - only rows still in `cooling` are touched (like `executeUserSoftDelete`).
 *   Without it, a cancel that landed just after the lifecycle cron
 *   soft-deleted the request overwrote `soft_deleted` with `cancelled`.
 * - nothing is touched once the ACCOUNT is deleted, i.e. `users.deleted_at`
 *   is set. With a legacy duplicate pair the cron soft-deletes the earlier row
 *   while the later one is still cooling; cancelling that one would report
 *   success and send the "cancelled" email to an account that stays deleted
 *   and banned. `users.deleted_at` is the signal, not a `soft_deleted` request
 *   row: the soft delete sets it in the same transaction as the request flip,
 *   and recovery clears it, whereas an old recovery could leave a duplicate
 *   request `soft_deleted` on an account that is open again.
 *
 * `requestId` is the cooling request the caller looked up. The outcome:
 * - `cancelled`: this call cancelled it;
 * - `already_cancelled`: another cancel got there first (a second tab, a
 *   retry, or a platform admin's intervene, which sends no email of its own),
 *   and the account is open;
 * - `too_late`: the account is already deleted, or the request left `cooling`
 *   some other way.
 */
export async function cancelUserDeletion(
  userId: string,
  cancelledBy: string,
  requestId: number,
) {
  const now = new Date();
  const db = createUnscopedClient();
  // True while the account is deleted, whichever request did it.
  const accountDeleted = sql<boolean>`exists (select 1 from ${users} u where u.id = ${userId} and u.deleted_at is not null)`;

  const requests = await db
    .update(accountDeletionRequests)
    .set({ status: 'cancelled', cancelledAt: now, cancelledBy })
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.status, 'cooling'),
        sql`not ${accountDeleted}`,
      ),
    )
    .returning();
  if (requests.some((r) => r.id === requestId)) {
    return { outcome: 'cancelled' as const, requests };
  }

  // Keyed on the user as well as the id, so this only reads their own request.
  const [row] = await db
    .select({ status: accountDeletionRequests.status, accountDeleted })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        eq(accountDeletionRequests.userId, userId),
      ),
    );
  if (row?.status === 'cancelled' && !row.accountDeleted) {
    return { outcome: 'already_cancelled' as const };
  }
  return { outcome: 'too_late' as const, status: row?.status ?? null };
}

/**
 * A deleted account must not leave a visitor pass working at the gate: a used
 * recurring, vendor or permanent pass never runs out on its own. Revokes them
 * in every community the user hosted passes in, the same way removing a
 * resident does. Best effort per community, and never fatal: a failure here
 * must not undo or abort the soft delete itself.
 */
async function revokeDeletedUsersVisitorPasses(
  db: ReturnType<typeof createUnscopedClient>,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  let hosts: { communityId: number; hostUserId: string | null }[];
  try {
    hosts = await db
      .select({ communityId: visitorLog.communityId, hostUserId: visitorLog.hostUserId })
      .from(visitorLog)
      .where(
        and(
          inArray(visitorLog.hostUserId, userIds),
          isNull(visitorLog.revokedAt),
          isNull(visitorLog.deletedAt),
        ),
      );
  } catch (err) {
    console.warn('[account-lifecycle] Failed to find visitor passes of deleted users:', err);
    return;
  }

  const pairs = new Map<string, { communityId: number; userId: string }>();
  for (const { communityId, hostUserId } of hosts) {
    if (hostUserId) pairs.set(`${communityId}|${hostUserId}`, { communityId, userId: hostUserId });
  }
  for (const { communityId, userId } of pairs.values()) {
    try {
      await revokeVisitorPassesForUser(communityId, userId);
    } catch (err) {
      console.warn(
        `[account-lifecycle] Failed to revoke visitor passes of user ${userId} in community ${communityId}:`,
        err,
      );
    }
  }
}

/** Where a deletion email goes. */
export interface DeletionEmailRecipient {
  email: string;
  fullName: string | null;
}

/**
 * Soft-deletes a user: sets users.deletedAt and bans in Supabase auth.
 * The auth ban is non-fatal — if Supabase is unreachable the DB state
 * is still committed.
 *
 * Returns one row per request soft-deleted, so duplicates of one user give
 * several rows; `onePerUser` reduces them to one per account.
 *
 * Each returned row carries `recipient`: the user's email and name as they
 * stood in the same statement that soft-deleted them. The "account deleted"
 * email is sent to that address, captured at soft delete — not re-read later,
 * when the purge may already have replaced it with `@redacted`. `null` when no
 * users row was updated for the request.
 */
export async function executeUserSoftDelete(requestIds: number[]) {
  if (requestIds.length === 0) return [];

  const now = new Date();
  const scheduledPurgeAt = deletionPurgeAt(now);
  const db = createUnscopedClient();

  const results = await db.transaction(async (tx) => {
    const requests = await tx
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted', scheduledPurgeAt })
      // State-guarded: only progress requests still in 'cooling'. A request
      // cancelled or recovered between the cron scan and this batch write is
      // simply not returned/updated (TOCTOU race protection) — without this,
      // a raced request would be force-flipped back to 'soft_deleted'.
      .where(
        and(
          inArray(accountDeletionRequests.id, requestIds),
          eq(accountDeletionRequests.status, 'cooling'),
        ),
      )
      .returning();

    // We don't throw if some are missing, just process what we found to avoid failing the whole batch

    const userIds = requests.map(r => r.userId);

    const recipients = new Map<string, DeletionEmailRecipient>();
    if (userIds.length > 0) {
      const deletedUsers = await tx
        .update(users)
        .set({ deletedAt: now })
        .where(inArray(users.id, userIds))
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
      for (const u of deletedUsers) {
        if (u.id) recipients.set(u.id, { email: u.email, fullName: u.fullName });
      }
    }

    return requests.map((r) => ({ ...r, recipient: recipients.get(r.userId) ?? null }));
  });

  // One ban (and one pass sweep) per user, however many of their requests
  // expired in this batch.
  const perUser = onePerUser(results);
  await revokeDeletedUsersVisitorPasses(db, perUser.map((r) => r.userId));

  // Ban in Supabase auth (non-fatal)
  const admin = createAdminClient();
  // Chunking to avoid rate limits
  const CHUNK_SIZE = 10;
  for (let i = 0; i < perUser.length; i += CHUNK_SIZE) {
    const chunk = perUser.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(
      chunk.map(async (result) => {
        try {
          // GoTrue reads 'none' as LIFT the ban. 876600h (~100y) is the
          // permanent ban demo-conversion uses; the admin console's recover
          // route (apps/admin …/deletion-requests/[id]/recover) lifts it.
          const { error } = await admin.auth.admin.updateUserById(result.userId, {
            ban_duration: PERMANENT_BAN,
            user_metadata: { soft_deleted: true },
          });
          if (error) throw new Error(error.message);
        } catch (err) {
          console.warn(
            `[account-lifecycle] Failed to ban user ${result.userId} in Supabase auth:`,
            err,
          );
        }
      })
    );
  }

  return results;
}

/**
 * SQL, for a deletion-request row: its user's CURRENT deletion is old enough to
 * purge, i.e. `users.deleted_at` is set and at or before `cutoff`.
 *
 * The request's own `scheduledPurgeAt` is not enough. A request can outlive the
 * deletion it belongs to (a duplicate left `soft_deleted` by an old recovery),
 * and if the account is deleted again later that stale date is already past:
 * the cron run that re-deletes it would purge it at once and skip the new
 * deletion's whole recovery window. `users.deleted_at` is the current
 * deletion's time, set and cleared with every soft delete and recovery.
 */
function userDeletionPurgeDue(cutoff: Date) {
  return sql`exists (select 1 from ${users} u where u.id = ${accountDeletionRequests.userId} and u.deleted_at is not null and u.deleted_at <= ${cutoff.toISOString()}::timestamptz)`;
}

/**
 * SQL, for a community deletion-request row: its community's CURRENT deletion
 * is old enough to purge (`communities.deleted_at` set and at or before
 * `cutoff`), or the community row no longer exists at all. The community twin
 * of `userDeletionPurgeDue`, for the same reason: a recovered community is
 * never purged, and one deleted again is not purged before its new deletion
 * has had the full recovery window, whatever an older request's
 * `scheduledPurgeAt` says.
 */
function communityDeletionPurgeDue(cutoff: Date) {
  return sql`(${accountDeletionRequests.communityId} is null or exists (select 1 from ${communities} c where c.id = ${accountDeletionRequests.communityId} and c.deleted_at is not null and c.deleted_at <= ${cutoff.toISOString()}::timestamptz))`;
}

/**
 * True while community `communityId` is still deleted. Read by the purge after
 * its claim and before each storage sweep.
 */
async function communityStillDeleted(
  db: ReturnType<typeof createUnscopedClient>,
  communityId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ deletedAt: communities.deletedAt })
    .from(communities)
    .where(eq(communities.id, communityId));
  // A missing row is as deleted as it gets; the claim treats it the same way.
  return !row || row.deletedAt !== null;
}

/**
 * The purge's claim on a request: the conditional write that makes the request
 * row's status the lock between purge and recovery.
 *
 * Purge and recovery each start by moving the request OUT of `soft_deleted`,
 * conditionally: the purge to `purged` (with `purged_at` still null, meaning
 * "claimed, not finished"), the recovery to `recovered`. Postgres serialises
 * the two UPDATEs on the row, so exactly one matches and the other touches
 * nothing. Neither side changes anything else until its claim has landed, so
 * they can no longer interleave (a recovery restoring a row the purge is
 * scrubbing, or the purge scrubbing an account a recovery just reopened).
 *
 * `purged` with a null `purged_at` also matches, so a purge that crashed after
 * its claim is picked up again by the next run (and two overlapping runs both
 * proceed, harmlessly: every purge step is idempotent). Recovery never matches
 * it, so for those days the request reads as being purged and recovery refuses.
 */
function purgeClaimable(requestId: number) {
  return and(
    eq(accountDeletionRequests.id, requestId),
    inArray(accountDeletionRequests.status, ['soft_deleted', 'purged']),
    isNull(accountDeletionRequests.purgedAt),
  );
}

/**
 * Scrubs PII from a user record after the purge window. Returns the purged
 * request, or `null` when it is skipped.
 *
 * Order: claim the request (see `purgeClaimable`; it also requires the user's
 * current deletion to be due), scrub `users`, scrub auth.users, then set
 * `purged_at`. Nothing is touched unless the claim matched. The users scrub is
 * also conditional on `deleted_at` still being set: an account reopened in
 * between through another request (a duplicate) is left alone and the claim is
 * released. A crash at any point after the claim leaves `purged` with a null
 * `purged_at`, which the next run picks up.
 */
export async function purgeUserPII(requestId: number) {
  const now = new Date();
  const db = createUnscopedClient();

  const [request] = await db
    .update(accountDeletionRequests)
    .set({ status: 'purged' })
    .where(
      and(
        purgeClaimable(requestId),
        eq(accountDeletionRequests.requestType, 'user'),
        userDeletionPurgeDue(deletionPurgeCutoff(now)),
      ),
    )
    .returning();

  // Recovered, already purged, re-deleted too recently, or not found.
  if (!request) return null;

  const scrubbed = await db
    .update(users)
    .set({
      email: `deleted-${request.userId}@redacted`,
      fullName: 'Deleted User',
      phone: null,
      phoneVerifiedAt: null,
      avatarUrl: null,
    })
    .where(and(eq(users.id, request.userId), isNotNull(users.deletedAt)))
    .returning({ id: users.id });
  if (scrubbed.length === 0) {
    // Reopened between the claim and here, through another request of the
    // same user. Release the claim exactly as it was taken; touch nothing else.
    await db
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted' })
      .where(
        and(
          eq(accountDeletionRequests.id, requestId),
          eq(accountDeletionRequests.status, 'purged'),
          isNull(accountDeletionRequests.purgedAt),
        ),
      );
    return null;
  }

  // auth.users keeps its own copy of the email and name. A failure leaves
  // purged_at null and the next run retries. A user missing from auth has
  // nothing left to scrub there; without this it would fail every night.
  // A null user_metadata value deletes that key; `.invalid` is a reserved TLD.
  const { error: authError } = await createAdminClient().auth.admin.updateUserById(request.userId, {
    email: `deleted-${request.userId}@redacted.invalid`,
    email_confirm: true,
    user_metadata: { full_name: null, fullName: null, external_user_id: null, soft_deleted: true },
  });
  if (authError) {
    // Only GoTrue's own "no such user" code. A bare 404 can come from a proxy
    // or a wrong URL, and treating that as "nothing to scrub" would finish the
    // purge with the email and name still in auth.users.
    if ((authError as { code?: string }).code !== 'user_not_found') {
      throw new Error(`Failed to scrub auth user ${request.userId}: ${authError.message}`);
    }
    console.warn(`[account-lifecycle] auth user ${request.userId} not found; treating auth as already scrubbed`);
    // An account deleted from Supabase Auth outside this lifecycle is worth a
    // look, so it is reported rather than only logged. Ids only.
    captureMessage('account_purge_auth_user_missing', {
      level: 'warning',
      extra: { requestId, userId: request.userId },
    });
  }

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ purgedAt: now })
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        eq(accountDeletionRequests.status, 'purged'),
        isNull(accountDeletionRequests.purgedAt),
      ),
    )
    .returning();
  // An overlapping run finished this request first; nothing left to do.
  return updated ?? null;
}

// ---------------------------------------------------------------------------
// Deletion — Community
// ---------------------------------------------------------------------------

/**
 * Creates a community deletion request with a 30-day cooling period, or
 * returns the one the community already has (the earliest, if a legacy
 * duplicate exists). One cooling request per community, like
 * `requestUserDeletion`: a second click must not start a second clock.
 */
export async function requestCommunityDeletion(communityId: number, requestedBy: string) {
  const now = new Date();
  const coolingEndsAt = deletionCoolingEndsAt(now);

  const db = createUnscopedClient();
  // ponytail: check-then-insert with no unique index, as in requestUserDeletion;
  // two calls racing past this read still create two rows (cancel and
  // intervene stop them all). Trigger: two cooling community rows observed in
  // prod; then add a partial unique index on (community_id) where
  // request_type = 'community' and status = 'cooling'.
  const [existing] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.communityId, communityId),
        eq(accountDeletionRequests.requestType, 'community'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    )
    .orderBy(asc(accountDeletionRequests.id))
    .limit(1);
  if (existing) return existing;

  const [request] = await db
    .insert(accountDeletionRequests)
    .values({
      requestType: 'community',
      userId: requestedBy,
      communityId,
      status: 'cooling',
      coolingEndsAt,
    })
    .returning();

  return request!;
}

/**
 * Cancels a community's deletion during its cooling period: the given request
 * and every other `cooling` request of the same community, in one transaction
 * (`interveneDeletionRequestOp`). The caller is the community's root manager,
 * through `DELETE /api/v1/communities/delete`, with a request it looked up by
 * that community's id.
 *
 * - Another cancel got there first: returns that row, writing nothing.
 * - The cron soft-deleted it first, or the community is already deleted
 *   through another request: `ConflictError` (409). Saying the community stays
 *   open would be false; restoring it is a platform-admin recovery.
 */
export async function interveneCommunityDeletion(
  requestId: number,
  params: { adminUserId: string; notes?: string },
) {
  const now = new Date();
  const result = await interveneDeletionRequestOp(requestId, {
    cancelledBy: params.adminUserId,
    notes: params.notes ?? null,
    now,
  });

  if (result.outcome === 'not_found') {
    throw new Error(`Deletion request ${requestId} not found`);
  }
  if (result.outcome === 'not_cooling' && result.request.status === 'cancelled') {
    return result.request;
  }
  if (result.outcome !== 'cancelled') {
    throw new ConflictError(
      'This community has already been deleted, so its deletion can no longer be cancelled. Contact support to restore it.',
    );
  }
  const updated = result.request;

  // `communityId` comes from the mutation's own result, not a separate read.
  //
  // The notes are deliberately NOT logged. They are admin-supplied free text
  // that can name a resident or repeat a grievance, and this table is
  // board-readable and append-only, so anything written here is visible to the
  // board permanently and cannot be retracted. `notesProvided` answers "was a
  // reason given" without committing the reason. (apps/admin's twin DOES log
  // them — into platform_admin_audit_log, which is operator-only with no RLS
  // policies. Different readership, different rule.)
  //
  // A user-type request has no community, so it hits the same NOT NULL wall as
  // the purge and simply is not audited. (The only caller passes a community
  // request.)
  if (updated.communityId !== null) {
    await logAuditEvent({
      userId: params.adminUserId,
      action: 'update',
      resourceType: 'account_deletion_request',
      resourceId: String(requestId),
      communityId: updated.communityId,
      newValues: {
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        cancelledBy: params.adminUserId,
      },
      metadata: {
        notesProvided: params.notes != null,
        cancelledRequestIds: result.cancelledRequestIds,
      },
    });
  }

  return updated;
}

/**
 * Soft-deletes a community: sets communities.deletedAt and schedules purge.
 */
export async function executeCommunitySoftDelete(requestIds: number[]) {
  if (requestIds.length === 0) return [];

  const now = new Date();
  const scheduledPurgeAt = deletionPurgeAt(now);
  const db = createUnscopedClient();

  const results = await db.transaction(async (tx) => {
    const requests = await tx
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted', scheduledPurgeAt })
      // State-guarded: only progress requests still in 'cooling'. A request
      // cancelled or recovered between the cron scan and this batch write is
      // simply not returned/updated (TOCTOU race protection) — without this,
      // a raced request would be force-flipped back to 'soft_deleted'.
      .where(
        and(
          inArray(accountDeletionRequests.id, requestIds),
          eq(accountDeletionRequests.status, 'cooling'),
        ),
      )
      .returning();

    // We don't throw if some are missing, just process what we found to avoid failing the whole batch

    const communityIds = requests.map(r => r.communityId!).filter(Boolean);

    if (communityIds.length > 0) {
      await tx
        .update(communities)
        .set({ deletedAt: now })
        .where(inArray(communities.id, communityIds));

      /*
       * Stop any export this community had in flight, in the SAME transaction
       * that soft-deletes it.
       *
       * The claim scan now skips soft-deleted communities, but a filter alone
       * would leave the job sitting `queued` — invisible to the requester,
       * holding the one-active-job-per-community slot for six months, and
       * firing on a stale cursor the moment the community is recovered. A job
       * that silently never runs is the failure mode this codebase keeps
       * meeting.
       *
       * `failed`, not `cancelled`: the settings card renders `errorMessage`
       * only under `failed` — `cancelled` shows a bare "Cancelled." that reads
       * as user-initiated, so the board member who asked for the export would
       * never learn why it stopped. Both release the exclusivity slot, so a
       * RECOVERED community can request a fresh export immediately, which is
       * what the cooling window requires.
       *
       * The worker's reaper then deletes whatever volumes the job had already
       * uploaded — which is the actual point: no partial copy of the
       * association's records left in storage through the cooling window.
       */
      await tx
        .update(communityExportJobs)
        .set({
          status: 'failed',
          errorCode: 'COMMUNITY_DELETED',
          errorMessage:
            'This account is scheduled for deletion, so the export was stopped before it finished. Recover the account and request a new export if you still need it.',
          leaseExpiresAt: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            inArray(communityExportJobs.communityId, communityIds),
            inArray(communityExportJobs.status, ['queued', 'running']),
            isNull(communityExportJobs.deletedAt),
          ),
        );
    }

    return requests;
  });

  return results;
}

/**
 * Terminal step of a COMMUNITY deletion: destroy the community's site assets and
 * generated export archives, then mark the request purged. Returns `null` when
 * skipped.
 *
 * Claims the request first (`purgeClaimable`: `soft_deleted` → `purged` with
 * `purged_at` still null), and only while the community's current deletion is
 * due (`communityDeletionPurgeDue`), so a recovery and this purge cannot both
 * act on one request. Nothing is destroyed unless the claim matched, and the
 * community is re-checked before each sweep. `purged_at` is set last, and a
 * crash in between is picked up by the next run.
 *
 * It deliberately does NOT delete association records — documents, minutes,
 * ledgers, violations, ARC. That is a decision, not an omission: see the
 * 2026-08-09 legal-risk audit ("Match copy to the code. No hard-purge build"),
 * and `content/legal/terms.md`, which tells users association records "may be
 * retained beyond the purge step" and names an individual-review path for
 * destruction requests. Associations sit under a ~7-year §718.111(12) retention
 * duty; destroying their records on a cron would create exposure, not close it.
 *
 * (This docblock previously claimed the function "scrubs PII for all
 * community-only users". It never did — that behaviour was specified in the
 * 2026-03-23 design and not implemented.)
 */
export async function purgeCommunityData(requestId: number) {
  const now = new Date();
  const db = createUnscopedClient();

  const [request] = await db
    .update(accountDeletionRequests)
    .set({ status: 'purged' })
    .where(
      and(
        purgeClaimable(requestId),
        eq(accountDeletionRequests.requestType, 'community'),
        communityDeletionPurgeDue(deletionPurgeCutoff(now)),
      ),
    )
    .returning();

  // Recovered, already purged, community restored or deleted too recently, or
  // not found.
  if (!request) return null;

  const communityId = request.communityId;
  let siteAssetsDeleted = 0;
  let adminAssetsDeleted = 0;
  let exportArchivesDeleted = 0;

  /**
   * Re-read before each irreversible sweep. A recovery refuses while any
   * request of the community is `purged`, so the claim already shuts it out;
   * this catches the community being restored any other way (by hand) after
   * the claim. Gives the claim back exactly as it was taken and stops.
   */
  const stillDeleted = async () => {
    if (communityId === null || (await communityStillDeleted(db, communityId))) return true;
    await db
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted' })
      .where(
        and(
          eq(accountDeletionRequests.id, requestId),
          eq(accountDeletionRequests.status, 'purged'),
          isNull(accountDeletionRequests.purgedAt),
        ),
      );
    console.warn(
      `[account-lifecycle] community ${communityId} was restored during the purge of request ${requestId}; claim released`,
    );
    return false;
  };

  // PR #2: purge community-site-assets storage if this is a community deletion.
  // Failure leaves purged_at null, so the claimed request is retried next run.
  if (communityId !== null) {
    if (!(await stillDeleted())) return null;
    ({ deletedCount: siteAssetsDeleted } = await purgeCommunitySiteAssets(communityId));
    if (!(await stillDeleted())) return null;
    // The OTHER website-asset bucket. `community-assets` holds the logos and
    // site imagery uploaded through the admin console, and nothing had ever
    // swept it — so a purged community's website images survived in a PUBLIC
    // bucket indefinitely. Same category the ToS names ("community website
    // assets"), same failure semantics: a throw here leaves purged_at null.
    ({ deletedCount: adminAssetsDeleted } = await purgeCommunityAdminAssets(communityId));
    if (!(await stillDeleted())) return null;
    // Generated export archives are a COPY OF THE ENTIRE ASSOCIATION — every
    // table plus every uploaded document, including resident PII. Without this
    // the whole dataset would survive in the exports bucket after the community
    // was purged, which is a right-to-erasure failure the export feature itself
    // would have introduced. Same failure semantics as the line above: a throw
    // here aborts the status update so the request stays retryable.
    // See docs/audits/2026-08-09-legal-risk-audit.md F-07.
    ({ deletedCount: exportArchivesDeleted } = await purgeCommunityExportArchives(communityId));
  }

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ purgedAt: now })
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        eq(accountDeletionRequests.status, 'purged'),
        isNull(accountDeletionRequests.purgedAt),
      ),
    )
    .returning();
  // An overlapping run finished this request first and audited it.
  if (!updated) return null;

  // Audited AFTER the flip, from data already in hand — no read-back, per the
  // fix in 8dd8f98f. Auditing first would record an outcome that might not
  // happen, and in an append-only, board-readable table a false "purged" entry
  // is strictly worse than a missing one: it can never be retracted.
  //
  // Payload is counts, ids and timestamps ONLY. Never the data being destroyed.
  //
  // A user-type request has no community, and compliance_audit_log.community_id
  // is NOT NULL with a RESTRICT FK — so that case cannot be audited here at all.
  // Passing 0 is not a workaround: there is no community 0, and the insert
  // FK-violates (the old web recoverUser did exactly that, and threw).
  // platform_admin_audit_log allows a null community but demands a non-null
  // admin_user_id, and this is a cron with no actor. Both doors are shut.
  //
  // Known and accepted: the flip and this write use different clients, so they
  // cannot share a transaction. Closing that window needs a transaction-aware
  // audit writer with exactly one caller. If this throws, the storage is already
  // gone and purged_at is already set; the cron's catch surfaces it and the
  // request is not retried. Let it propagate — an unaudited mutation must not
  // look like a clean success.
  if (communityId !== null) {
    await logAuditEvent({
      userId: null, // the cron has no actor; rendered as "System"
      action: 'community_purged',
      resourceType: 'account_deletion_request',
      resourceId: String(requestId),
      communityId,
      newValues: { status: 'purged', purgedAt: now.toISOString() },
      // Counted per bucket, not summed: the sweeps fail independently, and a
      // single total cannot distinguish "found nothing because there was
      // nothing" from "found nothing because it swept the wrong prefix".
      metadata: { siteAssetsDeleted, adminAssetsDeleted, exportArchivesDeleted },
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Lifecycle cron helpers (used by /api/v1/internal/account-lifecycle POST)
// ---------------------------------------------------------------------------

export interface LifecycleDeletionTransitionRow {
  id: number;
  requestType: 'user' | 'community';
}

/**
 * Find all `cooling`-status deletion requests whose `coolingEndsAt` has
 * passed. Used by the daily cron to advance them to `soft_deleted`.
 */
export async function findCoolingExpiredDeletionRequests(
  now: Date,
): Promise<LifecycleDeletionTransitionRow[]> {
  const db = createUnscopedClient();
  return (await db
    .select({
      id: accountDeletionRequests.id,
      requestType: accountDeletionRequests.requestType,
    })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.status, 'cooling'),
        lt(accountDeletionRequests.coolingEndsAt, now),
      ),
    )) as LifecycleDeletionTransitionRow[];
}

/**
 * Find the deletion requests the daily cron should purge: `soft_deleted` ones
 * whose `scheduledPurgeAt` has passed, plus ones a crashed purge already
 * claimed (`purged` with a null `purged_at`; see `purgeClaimable`). Only while
 * the target is still deleted and its current deletion is due: the user's
 * `deleted_at`, or the community's.
 * The purge functions re-check all of this in their claim.
 */
export async function findPurgeReadyDeletionRequests(
  now: Date,
): Promise<LifecycleDeletionTransitionRow[]> {
  const db = createUnscopedClient();
  return (await db
    .select({
      id: accountDeletionRequests.id,
      requestType: accountDeletionRequests.requestType,
    })
    .from(accountDeletionRequests)
    .where(
      and(
        inArray(accountDeletionRequests.status, ['soft_deleted', 'purged']),
        isNotNull(accountDeletionRequests.scheduledPurgeAt),
        lt(accountDeletionRequests.scheduledPurgeAt, now),
        isNull(accountDeletionRequests.purgedAt),
        // A user request is due only when its user's CURRENT deletion is: the
        // account is deleted now, and has been for the full purge delay. A
        // duplicate can stay `soft_deleted` after an operator recovered the
        // account (recovery used to flip only the one request it was given);
        // purging it would scrub an open account, or, once the account is
        // deleted again, purge it the same night with no recovery window.
        // A community request likewise needs its community's current deletion
        // to be due.
        sql`((${accountDeletionRequests.requestType} = 'user' and ${userDeletionPurgeDue(deletionPurgeCutoff(now))}) or (${accountDeletionRequests.requestType} = 'community' and ${communityDeletionPurgeDue(deletionPurgeCutoff(now))}))`,
      ),
    )) as LifecycleDeletionTransitionRow[];
}

/**
 * Requests a recovery claimed and did not finish: `recovered` with a null
 * `recovered_at` (see packages/db `deletion-request-ops.ts`). The purge never
 * touches them, so an account stopped half way through recovery would keep its
 * personal data past the purge date with nobody told. A recovery takes
 * seconds, so one still unfinished when the nightly cron runs almost always
 * crashed. Ids only, earliest first.
 */
export async function findUnfinishedRecoveryRequestIds(): Promise<number[]> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.status, 'recovered'),
        isNull(accountDeletionRequests.recoveredAt),
      ),
    )
    .orderBy(asc(accountDeletionRequests.id));
  return rows.map((r) => r.id);
}

/**
 * List every active access plan (not revoked, not converted). Cron uses
 * this as the input to per-plan expiry-notification dispatch.
 */
export async function listActiveAccessPlansForLifecycleCron(): Promise<AccessPlan[]> {
  const db = createUnscopedClient();
  return (await db
    .select()
    .from(accessPlans)
    .where(
      and(
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
      ),
    )) as AccessPlan[];
}

/**
 * Mark a notification-sent timestamp on an access plan, idempotently. Field
 * is one of `email14dSentAt`, `email7dSentAt`, `emailExpiredSentAt`.
 */
export async function markAccessPlanNotificationSent(
  planId: number,
  field: 'email14dSentAt' | 'email7dSentAt' | 'emailExpiredSentAt',
  sentAt: Date,
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(accessPlans)
    .set({ [field]: sentAt })
    .where(eq(accessPlans.id, planId));
}

export interface LifecycleAdminRecipient {
  email: string;
  fullName: string;
}

// role-v3: this role set is v3-only — ['property_manager','root_manager'].
const LIFECYCLE_ADMIN_ROLES = ADMIN_TIER_DB_ROLES;

/**
 * Resolve the recipient list for lifecycle email notifications: every
 * admin-tier member (both role generations) in the community.
 */
export async function lookupLifecycleAdminRecipients(
  communityId: number,
): Promise<LifecycleAdminRecipient[]> {
  const db = createUnscopedClient();
  return (await db
    .select({ email: users.email, fullName: users.fullName })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        inArray(userRoles.role, [...LIFECYCLE_ADMIN_ROLES]),
      ),
    )) as LifecycleAdminRecipient[];
}

/**
 * Look up a community's name for the lifecycle email subject/branding.
 * Returns the configured fallback `'Your Community'` when no row matches.
 */
export async function getCommunityNameForLifecycleEmail(
  communityId: number,
): Promise<string> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return row?.name ?? 'Your Community';
}
