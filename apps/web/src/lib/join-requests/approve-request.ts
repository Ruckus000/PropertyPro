/**
 * Join-request approve / deny service.
 *
 * Runs cross-tenant: the requester is not yet a member of the target community,
 * so callers use the unscoped client. Authorization contract: callers MUST have
 * already verified the reviewer's admin membership in the target community
 * via requirePermission(membership, 'residents', 'write').
 */
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  communityJoinRequests,
  userRoles,
  insertNotifications,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { NotFoundError, ConflictError } from '@/lib/api/errors';

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
    // Create user_roles row (v2 hybrid model: role='resident' + isUnitOwner flag)
    await tx.insert(userRoles).values({
      userId: req.userId,
      communityId: req.communityId,
      role: 'resident',
      isUnitOwner: isOwner,
      displayTitle,
      legacyRole: req.residentType,
    });

    // Mark request approved
    await tx
      .update(communityJoinRequests)
      .set({
        status: 'approved',
        reviewedBy: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(communityJoinRequests.id, input.requestId));
  });

  // Notify the requester (best-effort, outside the transaction)
  try {
    await insertNotifications([
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
    ]);
  } catch (error) {
    console.error('[approve-join-request] notification insert failed', {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

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

  await db
    .update(communityJoinRequests)
    .set({
      status: 'denied',
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      reviewNotes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(communityJoinRequests.id, input.requestId));

  // Notify the requester (best-effort)
  try {
    await insertNotifications([
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
    ]);
  } catch (error) {
    console.error('[deny-join-request] notification insert failed', {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    requestId: req.id,
    communityId: req.communityId,
    userId: req.userId,
    status: 'denied',
  };
}
