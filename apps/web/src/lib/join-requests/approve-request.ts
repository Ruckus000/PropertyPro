/**
 * Join-request approve / deny service.
 *
 * Runs cross-tenant: the requester is not yet a member of the target community,
 * so callers use the unscoped client. Authorization contract: callers MUST have
 * already verified the reviewer's admin membership in the target community
 * via requirePermission(membership, 'residents', 'write').
 */
// AUTHZ: Cross-tenant by design — the requester is not yet a member of the target community, so a scoped client wouldn't have permission. Caller MUST have verified reviewer admin membership via requirePermission(membership, 'residents', 'write') first.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  communityJoinRequests,
  createScopedClient,
  userRoles,
  insertNotifications,
} from '@propertypro/db';
import { and, desc, eq } from '@propertypro/db/filters';
import { NotFoundError, ConflictError } from '@/lib/api/errors';

export interface PendingJoinRequestRow {
  id: number;
  userId: string;
  communityId: number;
  unitIdentifier: string;
  residentType: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

/**
 * List pending join requests for a community, newest first. Tenant-scoped:
 * caller MUST have already verified the actor's residents.write permission
 * in this community. Returns the same row shape the GET admin endpoint
 * surfaces.
 */
export async function listPendingJoinRequestsForCommunity(
  communityId: number,
): Promise<PendingJoinRequestRow[]> {
  const db = createScopedClient(communityId);
  return await db
    .selectFrom<PendingJoinRequestRow>(
      communityJoinRequests,
      {
        id: communityJoinRequests.id,
        userId: communityJoinRequests.userId,
        communityId: communityJoinRequests.communityId,
        unitIdentifier: communityJoinRequests.unitIdentifier,
        residentType: communityJoinRequests.residentType,
        status: communityJoinRequests.status,
        reviewedBy: communityJoinRequests.reviewedBy,
        reviewedAt: communityJoinRequests.reviewedAt,
        reviewNotes: communityJoinRequests.reviewNotes,
        createdAt: communityJoinRequests.createdAt,
        updatedAt: communityJoinRequests.updatedAt,
      },
      and(eq(communityJoinRequests.status, 'pending')),
    )
    .orderBy(desc(communityJoinRequests.createdAt));
}

export interface CreateJoinRequestInput {
  userId: string;
  communityId: number;
  unitIdentifier: string;
  residentType: 'owner' | 'tenant';
}

export interface CreatedJoinRequest {
  id: number;
  status: string;
}

/**
 * Insert a new community join request for a user. Cross-tenant by design:
 * the user is not yet a member of the target community, so a scoped client
 * wouldn't have permission. Caller MUST already have:
 * - validated the input shape
 * - run `checkJoinRequestEligibility` (no existing role / pending request /
 *   30-day cooldown)
 * - enforced its own rate limit
 *
 * Throws if the insert returns no row (very unlikely; treated as a server
 * error by the caller, mirroring the route's pre-A3 behavior).
 */
export async function createJoinRequest(
  input: CreateJoinRequestInput,
): Promise<CreatedJoinRequest> {
  const db = createUnscopedClient();
  const [row] = await db
    .insert(communityJoinRequests)
    .values({
      userId: input.userId,
      communityId: input.communityId,
      unitIdentifier: input.unitIdentifier,
      residentType: input.residentType,
    })
    .returning({
      id: communityJoinRequests.id,
      status: communityJoinRequests.status,
    });
  if (!row) {
    throw new Error('Failed to insert join request');
  }
  return { id: row.id, status: row.status };
}

/**
 * List a user's own join requests across all communities, newest first.
 * Cross-tenant by design — see file-level AUTHZ comment.
 */
export async function listJoinRequestsForUser(userId: string) {
  const db = createUnscopedClient();
  return await db
    .select()
    .from(communityJoinRequests)
    .where(and(eq(communityJoinRequests.userId, userId)))
    .orderBy(desc(communityJoinRequests.createdAt));
}

/**
 * Cross-tenant lookup of a single join request's `communityId`. Used by
 * approve/deny routes to verify the request belongs to the reviewer's
 * community before mutating. Returns `null` when no row matches.
 *
 * AUTHZ: cross-tenant unscoped read; the request may not yet be associated
 * with any user_role, so a scoped client wouldn't see it. Callers MUST
 * compare the returned communityId against the reviewer's verified
 * `requirePermission(membership, 'residents', 'write')` community.
 */
export async function getJoinRequestCommunityId(
  requestId: number,
): Promise<number | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: communityJoinRequests.id,
      communityId: communityJoinRequests.communityId,
    })
    .from(communityJoinRequests)
    .where(eq(communityJoinRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  return row.communityId;
}

export interface ApproveInput {
  requestId: number;
  reviewerUserId: string;
  notes?: string;
}

export interface DenyInput {
  requestId: number;
  reviewerUserId: string;
  notes?: string;
}

export interface JoinRequestResult {
  requestId: number;
  communityId: number;
  userId: string;
  status: 'approved' | 'denied';
}

/**
 * Approve a pending join request:
 * - inserts a user_roles row (role='resident', isUnitOwner reflects residentType)
 * - marks the request approved
 * - notifies the requester (in-app)
 *
 * Throws if the request does not exist or is not pending.
 */
export async function approveJoinRequest(
  input: ApproveInput,
): Promise<JoinRequestResult> {
  const db = createUnscopedClient();

  const [req] = await db
    .select()
    .from(communityJoinRequests)
    .where(eq(communityJoinRequests.id, input.requestId))
    .limit(1);

  if (!req) throw new NotFoundError('Join request not found');
  if (req.status !== 'pending') throw new ConflictError('Request is not pending');

  const isOwner = req.residentType === 'owner';
  const displayTitle = isOwner ? 'Owner' : 'Tenant';

  await db.transaction(async (tx) => {
    // Conditional update: only transition pending → approved. Ensures atomicity
    // if two admins race to approve the same request.
    const updated = await tx
      .update(communityJoinRequests)
      .set({
        status: 'approved',
        reviewedBy: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityJoinRequests.id, input.requestId),
          eq(communityJoinRequests.status, 'pending'),
        ),
      )
      .returning();

    if (updated.length === 0) {
      throw new ConflictError('Request is no longer pending');
    }

    // Create user_roles row (v2 hybrid model: role='resident' + isUnitOwner flag)
    await tx.insert(userRoles).values({
      userId: req.userId,
      communityId: req.communityId,
      role: 'resident',
      isUnitOwner: isOwner,
      displayTitle,
      legacyRole: req.residentType,
    });

    // Notify the requester INSIDE the transaction (Plan C3): if the
    // notification insert fails for any reason, the entire approve rolls back
    // rather than leaving an approved request with no audit/notification
    // breadcrumb. Previous fire-and-forget pattern silently dropped failures
    // and broke the audit-trail contract.
    await insertNotifications(
      [
        {
          communityId: req.communityId,
          userId: req.userId,
          category: 'system',
          title: 'Welcome to the community',
          body: 'Your request to join has been approved.',
          sourceType: 'join_request',
          sourceId: String(req.id),
          priority: 'normal',
          actionUrl: '/dashboard',
        },
      ],
      tx,
    );
  });

  return {
    requestId: req.id,
    communityId: req.communityId,
    userId: req.userId,
    status: 'approved',
  };
}

/**
 * Deny a pending join request. Does NOT create a user_roles row.
 */
export async function denyJoinRequest(
  input: DenyInput,
): Promise<JoinRequestResult> {
  const db = createUnscopedClient();

  const [req] = await db
    .select()
    .from(communityJoinRequests)
    .where(eq(communityJoinRequests.id, input.requestId))
    .limit(1);

  if (!req) throw new NotFoundError('Join request not found');
  if (req.status !== 'pending') throw new ConflictError('Request is not pending');

  // Conditional update + notification inside a single transaction (Plan C3):
  // either the deny status flip + audit notification both commit, or both
  // roll back. Atomic against concurrent deny attempts via the
  // status='pending' WHERE clause.
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(communityJoinRequests)
      .set({
        status: 'denied',
        reviewedBy: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityJoinRequests.id, input.requestId),
          eq(communityJoinRequests.status, 'pending'),
        ),
      )
      .returning();

    if (updated.length === 0) {
      throw new ConflictError('Request is no longer pending');
    }

    await insertNotifications(
      [
        {
          communityId: req.communityId,
          userId: req.userId,
          category: 'system',
          title: 'Join request not approved',
          body: input.notes
            ? `Reason: ${input.notes}`
            : 'Please contact your community admin for details.',
          sourceType: 'join_request',
          sourceId: String(req.id),
          priority: 'normal',
        },
      ],
      tx,
    );
  });

  return {
    requestId: req.id,
    communityId: req.communityId,
    userId: req.userId,
    status: 'denied',
  };
}
