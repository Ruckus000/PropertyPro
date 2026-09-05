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
import { addDays, addMonths } from 'date-fns';
import { eq, and, desc, inArray, isNull, isNotNull, lt, ne } from '@propertypro/db/filters';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';
import {
  accessPlans,
  communities,
  communityExportJobs,
  users,
  userRoles,
  accountDeletionRequests,
  logAuditEvent,
} from '@propertypro/db';
import type { AccessPlan } from '@propertypro/db';
// AUTHZ: Account lifecycle: platform-level access plans + deletion workflows (no community_id scoping)
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { purgeCommunityAdminAssets, purgeCommunitySiteAssets } from '@/lib/site-assets/cleanup';
import { purgeCommunityExportArchives } from '@/lib/services/export/purge-export-archives';
import {
  findRootOffboardingImpact,
  type RootOffboardingCommunity,
} from '@/lib/account-lifecycle/root-offboarding';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessPlanStatus = 'revoked' | 'converted' | 'active' | 'in_grace' | 'expired';

export interface GrantFreeAccessParams {
  durationMonths: number;
  gracePeriodDays: number;
  notes?: string;
  grantedBy: string;
}

export interface RevokeFreeAccessParams {
  revokedBy: string;
  reason?: string;
}

export interface ExtendFreeAccessParams {
  additionalMonths: number;
  grantedBy: string;
  notes?: string;
}

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
// Free Access — Listing (admin)
// ---------------------------------------------------------------------------

/**
 * List access plans, optionally filtered by community. Returns each row with
 * a computed `status` field — callers should not re-derive status separately.
 *
 * Admin/platform-scoped read: uses the unscoped client because access_plans
 * is a platform-level table. Callers MUST authorize via `requirePlatformAdmin`
 * before invoking.
 */
export async function listAccessPlansWithStatus(
  options: { communityId?: number } = {},
): Promise<Array<AccessPlan & { status: AccessPlanStatus }>> {
  const db = createUnscopedClient();
  const rows = options.communityId !== undefined
    ? await db
        .select()
        .from(accessPlans)
        .where(eq(accessPlans.communityId, options.communityId))
    : await db.select().from(accessPlans);
  return rows.map((plan) => ({ ...plan, status: computeAccessPlanStatus(plan) }));
}

// ---------------------------------------------------------------------------
// Deletion Requests — Listing + Lookup (admin)
// ---------------------------------------------------------------------------

export type DeletionRequestStatus =
  | 'cooling'
  | 'soft_deleted'
  | 'purged'
  | 'cancelled'
  | 'recovered';

export type DeletionRequestType = 'user' | 'community';

export interface ListDeletionRequestsOptions {
  status?: DeletionRequestStatus;
  requestType?: DeletionRequestType;
}

/**
 * List account-deletion requests, optionally filtered by status and/or type.
 *
 * Admin/platform-scoped read: uses the unscoped client because
 * `account_deletion_requests` is a platform-level table. Callers MUST
 * authorize via `requirePlatformAdmin` before invoking.
 */
export async function listDeletionRequests(
  options: ListDeletionRequestsOptions = {},
) {
  const db = createUnscopedClient();
  const conditions = [];
  if (options.status !== undefined) {
    conditions.push(eq(accountDeletionRequests.status, options.status));
  }
  if (options.requestType !== undefined) {
    conditions.push(eq(accountDeletionRequests.requestType, options.requestType));
  }

  if (conditions.length === 0) {
    return await db.select().from(accountDeletionRequests);
  }
  if (conditions.length === 1) {
    return await db.select().from(accountDeletionRequests).where(conditions[0]!);
  }
  return await db.select().from(accountDeletionRequests).where(and(...conditions));
}

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
 * Find the user's active `cooling` deletion request, if any. Returns the
 * request id or `null`. Used by the cancel-deletion path.
 *
 * AUTHZ: cross-tenant read of platform-level table; safe for the user to
 * query their own row by `userId`.
 */
export async function findCoolingDeletionRequestForUser(
  userId: string,
): Promise<number | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.requestType, 'user'),
        eq(accountDeletionRequests.status, 'cooling'),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Look up the `requestType` of a single deletion request. Returns `null`
 * when the id doesn't match a row (so the caller can throw NotFoundError).
 *
 * Admin/platform read: uses the unscoped client. Callers MUST authorize via
 * `requirePlatformAdmin` before invoking.
 */
export async function getDeletionRequestType(
  requestId: number,
): Promise<DeletionRequestType | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ requestType: accountDeletionRequests.requestType })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  return row.requestType as DeletionRequestType;
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

/**
 * Existence check on the platform-level `communities` table. Returns true
 * when a row matches `id`, false otherwise.
 *
 * Admin/platform read: uses the unscoped client. Callers MUST authorize via
 * `requirePlatformAdmin` before invoking.
 */
export async function communityExistsAdmin(communityId: number): Promise<boolean> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Free Access — Grant
// ---------------------------------------------------------------------------

/**
 * Creates an access plan for a community and denormalizes the expiry date
 * onto the communities table for fast subscription guard checks.
 *
 * Runs in a transaction: plan insert + community update are atomic.
 */
export async function grantFreeAccess(
  communityId: number,
  params: GrantFreeAccessParams,
) {
  const now = new Date();
  const expiresAt = addMonths(now, params.durationMonths);
  const graceEndsAt = addDays(expiresAt, params.gracePeriodDays);

  const db = createUnscopedClient();

  const [plan] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(accessPlans)
      .values({
        communityId,
        expiresAt,
        graceEndsAt,
        durationMonths: params.durationMonths,
        gracePeriodDays: params.gracePeriodDays,
        grantedBy: params.grantedBy,
        notes: params.notes ?? null,
      })
      .returning();

    await tx
      .update(communities)
      .set({ freeAccessExpiresAt: graceEndsAt })
      .where(eq(communities.id, communityId));

    return inserted;
  });

  await logAuditEvent({
    userId: params.grantedBy,
    action: 'create',
    resourceType: 'access_plan',
    resourceId: String(plan!.id),
    communityId,
    newValues: {
      durationMonths: params.durationMonths,
      gracePeriodDays: params.gracePeriodDays,
      expiresAt: expiresAt.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    },
  });

  return plan!;
}

// ---------------------------------------------------------------------------
// Free Access — Revoke
// ---------------------------------------------------------------------------

/**
 * Revokes an active access plan. If no other active plans remain for the
 * community, clears the denormalized free_access_expires_at column.
 */
export async function revokeFreeAccess(
  planId: number,
  params: RevokeFreeAccessParams,
) {
  const now = new Date();
  const db = createUnscopedClient();

  const result = await db.transaction(async (tx) => {
    // Mark plan as revoked
    const [revoked] = await tx
      .update(accessPlans)
      .set({ revokedAt: now, revokedBy: params.revokedBy })
      .where(eq(accessPlans.id, planId))
      .returning();

    if (!revoked) throw new Error(`Access plan ${planId} not found`);

    // Check for other active (non-revoked, non-converted) plans for this community
    const otherPlans = await tx
      .select()
      .from(accessPlans)
      .where(
        and(
          eq(accessPlans.communityId, revoked.communityId),
          isNull(accessPlans.revokedAt),
          isNull(accessPlans.convertedAt),
          ne(accessPlans.id, planId),
        ),
      );

    if (otherPlans.length === 0) {
      // No other active plans — clear denormalized column
      await tx
        .update(communities)
        .set({ freeAccessExpiresAt: null })
        .where(eq(communities.id, revoked.communityId));
    }

    return revoked;
  });

  await logAuditEvent({
    userId: params.revokedBy,
    action: 'update',
    resourceType: 'access_plan',
    resourceId: String(planId),
    communityId: result.communityId,
    newValues: { revokedAt: now.toISOString(), reason: params.reason ?? null },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Free Access — Extend
// ---------------------------------------------------------------------------

/**
 * Extends free access by revoking the current plan and creating a new one
 * with extended dates. Both operations happen in a single transaction.
 */
export async function extendFreeAccess(
  planId: number,
  params: ExtendFreeAccessParams,
) {
  const now = new Date();
  const db = createUnscopedClient();

  const { oldPlan, newPlan } = await db.transaction(async (tx) => {
    // Revoke old plan
    const [revoked] = await tx
      .update(accessPlans)
      .set({ revokedAt: now, revokedBy: params.grantedBy })
      .where(eq(accessPlans.id, planId))
      .returning();

    if (!revoked) throw new Error(`Access plan ${planId} not found`);

    // Compute extended dates from the original expiry (not from now)
    const newExpiresAt = addMonths(revoked.expiresAt, params.additionalMonths);
    const newGraceEndsAt = addDays(newExpiresAt, revoked.gracePeriodDays);

    const [created] = await tx
      .insert(accessPlans)
      .values({
        communityId: revoked.communityId,
        expiresAt: newExpiresAt,
        graceEndsAt: newGraceEndsAt,
        durationMonths: revoked.durationMonths + params.additionalMonths,
        gracePeriodDays: revoked.gracePeriodDays,
        grantedBy: params.grantedBy,
        notes: params.notes ?? null,
      })
      .returning();

    // Update denormalized column with new grace end
    await tx
      .update(communities)
      .set({ freeAccessExpiresAt: newGraceEndsAt })
      .where(eq(communities.id, revoked.communityId));

    return { oldPlan: revoked, newPlan: created! };
  });

  await logAuditEvent({
    userId: params.grantedBy,
    action: 'update',
    resourceType: 'access_plan',
    resourceId: String(newPlan.id),
    communityId: oldPlan.communityId,
    oldValues: { planId: oldPlan.id, expiresAt: oldPlan.expiresAt.toISOString() },
    newValues: {
      planId: newPlan.id,
      additionalMonths: params.additionalMonths,
      expiresAt: newPlan.expiresAt.toISOString(),
      graceEndsAt: newPlan.graceEndsAt.toISOString(),
    },
  });

  return newPlan;
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
 * Creates a deletion request with a 30-day cooling period.
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
  const coolingEndsAt = addDays(now, 30);

  // Ack gate BEFORE any write. Unlike the flagging below, a failure here must
  // propagate: if we cannot determine the impact we must not silently proceed
  // to delete a root's account as though there were none.
  const rootImpact = await findRootOffboardingImpact(userId);
  if (rootImpact.length > 0 && !acknowledgeRootOffboarding) {
    throw new RootOffboardingAckRequiredError(rootImpact);
  }

  const db = createUnscopedClient();
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

  return request;
}

/** Cancels a deletion request during the cooling period. */
export async function cancelUserDeletion(requestId: number, cancelledBy: string) {
  const now = new Date();
  const db = createUnscopedClient();

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ status: 'cancelled', cancelledAt: now, cancelledBy })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

  if (!updated) throw new Error(`Deletion request ${requestId} not found`);
  return updated;
}

/**
 * Soft-deletes a user: sets users.deletedAt and bans in Supabase auth.
 * The auth ban is non-fatal — if Supabase is unreachable the DB state
 * is still committed.
 */
export async function executeUserSoftDelete(requestIds: number[]) {
  if (requestIds.length === 0) return [];

  const now = new Date();
  const scheduledPurgeAt = addMonths(now, 6);
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

    if (userIds.length > 0) {
      await tx
        .update(users)
        .set({ deletedAt: now })
        .where(inArray(users.id, userIds));
    }

    return requests;
  });

  // Ban in Supabase auth (non-fatal)
  const admin = createAdminClient();
  // Chunking to avoid rate limits
  const CHUNK_SIZE = 10;
  for (let i = 0; i < results.length; i += CHUNK_SIZE) {
    const chunk = results.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(
      chunk.map(async (result) => {
        try {
          await admin.auth.admin.updateUserById(result.userId, {
            ban_duration: 'none',
            user_metadata: { soft_deleted: true },
          });
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

/** Recovers a soft-deleted user: clears deletedAt and sets status to recovered. */
export async function recoverUser(requestId: number, recoveredBy: string) {
  const now = new Date();
  const db = createUnscopedClient();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(accountDeletionRequests)
      .set({ status: 'recovered', recoveredAt: now })
      .where(eq(accountDeletionRequests.id, requestId))
      .returning();

    if (!request) throw new Error(`Deletion request ${requestId} not found`);

    await tx
      .update(users)
      .set({ deletedAt: null })
      .where(eq(users.id, request.userId));

    return request;
  });

  // NOT audited, and `communityId: 0` was never a way to do it.
  //
  // This is a USER recovery, so there is no community — but
  // compliance_audit_log.community_id is NOT NULL with an ON DELETE RESTRICT FK
  // to communities.id, and communities.id is a bigserial whose lowest value in
  // production is 1. So the previous `communityId: 0, // platform-level, no
  // community` did not record a platform-level event: it threw. And because it
  // ran AFTER the transaction committed, the recovery succeeded and then
  // POST /api/v1/admin/deletion-requests/[id]/recover returned 500 — an
  // operation that worked, reported as broken.
  //
  // There is no other home for it either: platform_admin_audit_log permits a
  // null community but requires a non-null admin_user_id, which fits a platform
  // admin but not the cron paths that share this shape. Recording nothing is
  // honest; recording it against an arbitrary community would not be.
  return result;
}

/**
 * Scrubs PII from a user record after the purge window.
 * Idempotent: guarded by purgedAt IS NULL on the deletion request.
 */
export async function purgeUserPII(requestId: number) {
  const now = new Date();
  const db = createUnscopedClient();

  const [request] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        isNull(accountDeletionRequests.purgedAt),
      ),
    );

  if (!request) return null; // Already purged or not found — idempotent

  await db
    .update(users)
    .set({
      email: `deleted-${request.userId}@redacted`,
      fullName: 'Deleted User',
      phone: null,
      avatarUrl: null,
    })
    .where(eq(users.id, request.userId));

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ status: 'purged', purgedAt: now })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

  return updated!;
}

// ---------------------------------------------------------------------------
// Deletion — Community
// ---------------------------------------------------------------------------

/** Creates a community deletion request with a 30-day cooling period. */
export async function requestCommunityDeletion(communityId: number, requestedBy: string) {
  const now = new Date();
  const coolingEndsAt = addDays(now, 30);

  const db = createUnscopedClient();
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

/** Platform admin cancels a community deletion request. */
export async function interveneCommunityDeletion(
  requestId: number,
  params: { adminUserId: string; notes?: string },
) {
  const now = new Date();
  const db = createUnscopedClient();

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: params.adminUserId,
      interventionNotes: params.notes ?? null,
    })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

  if (!updated) throw new Error(`Deletion request ${requestId} not found`);

  // `communityId` comes from the mutation's own .returning(), not a separate
  // read — same rule as the purge above.
  //
  // The notes are deliberately NOT logged. They are admin-supplied free text
  // that can name a resident or repeat a grievance, and this table is
  // board-readable and append-only, so anything written here is visible to the
  // board permanently and cannot be retracted. `notesProvided` answers "was a
  // reason given" without committing the reason. (apps/admin's twin DOES log
  // them — into platform_admin_audit_log, which is operator-only with no RLS
  // policies. Different readership, different rule.)
  //
  // A user-type request reaches this function too — the route applies no
  // requestType filter — and has no community, so it hits the same NOT NULL
  // wall as the purge and simply is not audited.
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
      metadata: { notesProvided: params.notes != null },
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
  const scheduledPurgeAt = addMonths(now, 6);
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

/** Recovers a soft-deleted community. */
export async function recoverCommunity(requestId: number, adminUserId: string) {
  const now = new Date();
  const db = createUnscopedClient();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(accountDeletionRequests)
      .set({ status: 'recovered', recoveredAt: now })
      .where(eq(accountDeletionRequests.id, requestId))
      .returning();

    if (!request) throw new Error(`Deletion request ${requestId} not found`);

    await tx
      .update(communities)
      .set({ deletedAt: null })
      .where(eq(communities.id, request.communityId!));

    return request;
  });

  await logAuditEvent({
    userId: adminUserId,
    action: 'update',
    resourceType: 'account_deletion_request',
    resourceId: String(requestId),
    communityId: result.communityId ?? 0,
    newValues: { status: 'recovered', recoveredAt: now.toISOString() },
  });

  return result;
}

/**
 * Terminal step of a COMMUNITY deletion: destroy the community's site assets and
 * generated export archives, then mark the request purged. Idempotent, guarded
 * by `purgedAt IS NULL`.
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
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.id, requestId),
        isNull(accountDeletionRequests.purgedAt),
      ),
    );

  if (!request) return null; // Already purged or not found — idempotent

  const communityId = request.communityId;
  let siteAssetsDeleted = 0;
  let adminAssetsDeleted = 0;
  let exportArchivesDeleted = 0;

  // PR #2: purge community-site-assets storage if this is a community deletion.
  // Failure aborts the status update so the request remains retryable.
  if (communityId !== null) {
    ({ deletedCount: siteAssetsDeleted } = await purgeCommunitySiteAssets(communityId));
    // The OTHER website-asset bucket. `community-assets` holds the logos and
    // site imagery uploaded through the admin console, and nothing had ever
    // swept it — so a purged community's website images survived in a PUBLIC
    // bucket indefinitely. Same category the ToS names ("community website
    // assets"), same failure semantics: a throw here aborts the status update
    // below, and the cron never retries a request already marked 'purged'.
    ({ deletedCount: adminAssetsDeleted } = await purgeCommunityAdminAssets(communityId));
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
    .set({ status: 'purged', purgedAt: now })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

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
  // FK-violates (see recoverUser, where exactly that has been throwing).
  // platform_admin_audit_log allows a null community but demands a non-null
  // admin_user_id, and this is a cron with no actor. Both doors are shut.
  //
  // Known and accepted: the flip and this write use different clients, so they
  // cannot share a transaction. Closing that window needs a transaction-aware
  // audit writer with exactly one caller. If this throws, the storage is already
  // gone and the status is already 'purged'; the cron's catch surfaces it and
  // the request is not retried. Let it propagate — an unaudited mutation must
  // not look like a clean success.
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

  return updated!;
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
 * Find all `soft_deleted`-status deletion requests whose `scheduledPurgeAt`
 * has passed and that have not already been purged. Used by the daily cron
 * to advance them to permanent purge.
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
        eq(accountDeletionRequests.status, 'soft_deleted'),
        isNotNull(accountDeletionRequests.scheduledPurgeAt),
        lt(accountDeletionRequests.scheduledPurgeAt, now),
        isNull(accountDeletionRequests.purgedAt),
      ),
    )) as LifecycleDeletionTransitionRow[];
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

// BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
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
