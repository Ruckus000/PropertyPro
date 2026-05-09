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
import {
  accessPlans,
  communities,
  users,
  userRoles,
  accountDeletionRequests,
  logAuditEvent,
} from '@propertypro/db';
import type { AccessPlan } from '@propertypro/db';
// AUTHZ: Account lifecycle: platform-level access plans + deletion workflows (no community_id scoping)
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

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

/** Creates a deletion request with a 30-day cooling period. */
export async function requestUserDeletion(userId: string) {
  const now = new Date();
  const coolingEndsAt = addDays(now, 30);

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

  return request!;
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
export async function executeUserSoftDelete(requestId: number) {
  const now = new Date();
  const scheduledPurgeAt = addMonths(now, 6);
  const db = createUnscopedClient();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted', scheduledPurgeAt })
      .where(eq(accountDeletionRequests.id, requestId))
      .returning();

    if (!request) throw new Error(`Deletion request ${requestId} not found`);

    await tx
      .update(users)
      .set({ deletedAt: now })
      .where(eq(users.id, request.userId));

    return request;
  });

  // Ban in Supabase auth (non-fatal)
  try {
    const admin = createAdminClient();
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

  return result;
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

  await logAuditEvent({
    userId: recoveredBy,
    action: 'update',
    resourceType: 'account_deletion_request',
    resourceId: String(requestId),
    communityId: 0, // platform-level, no community
    newValues: { status: 'recovered', recoveredAt: now.toISOString() },
  });

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
  return updated;
}

/**
 * Soft-deletes a community: sets communities.deletedAt and schedules purge.
 */
export async function executeCommunitySoftDelete(requestId: number) {
  const now = new Date();
  const scheduledPurgeAt = addMonths(now, 6);
  const db = createUnscopedClient();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(accountDeletionRequests)
      .set({ status: 'soft_deleted', scheduledPurgeAt })
      .where(eq(accountDeletionRequests.id, requestId))
      .returning();

    if (!request) throw new Error(`Deletion request ${requestId} not found`);

    await tx
      .update(communities)
      .set({ deletedAt: now })
      .where(eq(communities.id, request.communityId!));

    return request;
  });

  return result;
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
 * Scrubs PII for all community-only users (those with no roles in other communities).
 * Idempotent: guarded by purgedAt IS NULL.
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

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ status: 'purged', purgedAt: now })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

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

const LIFECYCLE_ADMIN_ROLES = ['manager', 'pm_admin'] as const;

/**
 * Resolve the recipient list for lifecycle email notifications: every
 * `manager` or `pm_admin` in the community.
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
