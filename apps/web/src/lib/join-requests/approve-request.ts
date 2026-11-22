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
  communities,
  communityJoinRequests,
  createScopedClient,
  units,
  users,
  userRoles,
  insertNotifications,
} from '@propertypro/db';
import { and, desc, eq, inArray, isNull, sql } from '@propertypro/db/filters';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api/errors';

/**
 * Apartment communities have no unit owners (ADR-006: `isUnitOwner` splits a
 * condo/HOA resident into owner or tenant; an apartment resident is always a
 * tenant). Join requests to one are tenant-only, enforced at submit AND at
 * approval so a request filed before this rule cannot mint an owner.
 */
const APARTMENT_OWNER_REQUEST_MESSAGE =
  'Apartment communities accept tenant requests only. Choose Tenant and try again.';

function isApartment(communityType: string | null | undefined): boolean {
  return communityType === 'apartment';
}

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
  /** The claimed unit number matches a unit on this community's roster. */
  unitOnRoster?: boolean;
  /** Who is asking — the reviewer checks this against ownership/lease records. */
  requesterName?: string | null;
  requesterEmail?: string | null;
  [key: string]: unknown;
}

/** Unit numbers are unique per community case-insensitively (units_community_unit_number_unique). */
function unitKey(identifier: string): string {
  return identifier.trim().toLowerCase();
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
  const rows = await db
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
  if (rows.length === 0) return rows;

  // Tell the reviewer whether approving will link a unit (see approveJoinRequest),
  // and who is asking: approving a claimed owner of a real unit gives that
  // unit's access, so the reviewer must be able to check the person against
  // ownership or lease records. The requester chose to ask this community.
  const claimed = [...new Set(rows.map((row) => unitKey(row.unitIdentifier)))];
  const [onRoster, requesters] = await Promise.all([
    db.selectFrom<{ unitNumber: string }>(
      units,
      { unitNumber: units.unitNumber },
      and(isNull(units.deletedAt), inArray(sql`lower(${units.unitNumber})`, claimed)),
    ),
    db.selectFrom<{ id: string; fullName: string | null; email: string }>(
      users,
      { id: users.id, fullName: users.fullName, email: users.email },
      inArray(users.id, [...new Set(rows.map((row) => row.userId))]),
    ),
  ]);
  const known = new Set(onRoster.map((unit) => unitKey(unit.unitNumber)));
  const byId = new Map(requesters.map((user) => [user.id, user]));
  return rows.map((row) => ({
    ...row,
    unitOnRoster: known.has(unitKey(row.unitIdentifier)),
    requesterName: byId.get(row.userId)?.fullName ?? null,
    requesterEmail: byId.get(row.userId)?.email ?? null,
  }));
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

  // AUTHZ: unscoped read of ONE community's type by the id the caller chose to
  // request. Exposes nothing back (it only gates the insert), and the requester
  // is not a member yet, so a scoped client cannot see the row.
  const [community] = await db
    .select({ communityType: communities.communityType })
    .from(communities)
    .where(and(eq(communities.id, input.communityId), isNull(communities.deletedAt)))
    .limit(1);
  if (!community) throw new NotFoundError('Community not found');
  if (isApartment(community.communityType) && input.residentType === 'owner') {
    throw new ValidationError(APARTMENT_OWNER_REQUEST_MESSAGE, {
      fields: [{ field: 'residentType', message: APARTMENT_OWNER_REQUEST_MESSAGE }],
    });
  }

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

/** One of the requester's own join requests, as the requester may see it. */
export interface OwnJoinRequestRow {
  id: number;
  communityId: number;
  communityName: string | null;
  unitIdentifier: string;
  residentType: string;
  status: string;
  /**
   * The reviewer's note, for a DENIED request only — the deny dialog tells the
   * manager it is sent to the requester, so they know why. Null for every
   * other status: an approval note is written for managers (nothing in the
   * approve flow labels it shared) and stays with them.
   */
  reviewNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

/**
 * List a user's own join requests across all communities, newest first.
 *
 * Projected for the requester: no `reviewedBy` (the reviewing manager's user id
 * is not the requester's to see) and no `userId`/`updatedAt`.
 */
export async function listJoinRequestsForUser(userId: string): Promise<OwnJoinRequestRow[]> {
  const db = createUnscopedClient();
  // AUTHZ: cross-tenant read keyed to the authenticated requester's own rows
  // (`userId` comes from requireAuthenticatedUserId in the route). The join
  // reads only the NAME of each community they asked to join — a name they
  // already saw in the public community search before requesting — and the
  // requester is not a member yet, so a scoped client could not read it.
  const rows = await db
    .select({
      id: communityJoinRequests.id,
      communityId: communityJoinRequests.communityId,
      communityName: communities.name,
      unitIdentifier: communityJoinRequests.unitIdentifier,
      residentType: communityJoinRequests.residentType,
      status: communityJoinRequests.status,
      reviewNotes: communityJoinRequests.reviewNotes,
      reviewedAt: communityJoinRequests.reviewedAt,
      createdAt: communityJoinRequests.createdAt,
    })
    .from(communityJoinRequests)
    .leftJoin(communities, eq(communities.id, communityJoinRequests.communityId))
    .where(eq(communityJoinRequests.userId, userId))
    .orderBy(desc(communityJoinRequests.createdAt));
  return rows.map((row) => ({
    ...row,
    reviewNotes: row.status === 'denied' ? row.reviewNotes : null,
  }));
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

/** An approval also says what was asked for and what was granted, for the audit log. */
export interface ApproveJoinRequestResult extends JoinRequestResult {
  /** The type on the request as filed. */
  requestedResidentType: string;
  /** The membership created: an apartment owner request is granted as tenant. */
  grantedResidentType: 'owner' | 'tenant';
}

/**
 * Approve a pending join request:
 * - inserts a user_roles row (role='resident', isUnitOwner reflects residentType)
 * - marks the request approved (an owner request to an apartment is also
 *   rewritten to `residentType = 'tenant'`, matching the membership granted)
 * - notifies the requester (in-app)
 *
 * Throws if the request does not exist or is not pending.
 */
export async function approveJoinRequest(
  input: ApproveInput,
): Promise<ApproveJoinRequestResult> {
  const db = createUnscopedClient();

  const [req] = await db
    .select()
    .from(communityJoinRequests)
    .where(eq(communityJoinRequests.id, input.requestId))
    .limit(1);

  if (!req) throw new NotFoundError('Join request not found');
  if (req.status !== 'pending') throw new ConflictError('Request is not pending');

  // An apartment has no unit owners, so an owner request to one — filed
  // before submit refused them — is approved as a tenant rather than minting
  // `isUnitOwner = true` in a community where nothing reads it correctly.
  const [community] = await db
    .select({ communityType: communities.communityType })
    .from(communities)
    .where(eq(communities.id, req.communityId))
    .limit(1);
  const isOwner = req.residentType === 'owner' && !isApartment(community?.communityType);
  const displayTitle = isOwner ? 'Owner' : 'Tenant';
  // The request row records what was granted, so the requester's list and the
  // admin list say Tenant rather than the Owner that was asked for.
  const requestedResidentType = req.residentType;
  const convertedToTenant = requestedResidentType === 'owner' && !isOwner;

  await db.transaction(async (tx) => {
    // Conditional update: only transition pending → approved. Ensures atomicity
    // if two admins race to approve the same request.
    const updated = await tx
      .update(communityJoinRequests)
      .set({
        status: 'approved',
        ...(convertedToTenant ? { residentType: 'tenant' } : {}),
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

    // Link the unit they claimed when it is on this community's roster. The
    // membership used to be created with no unit at all, so an approved
    // resident had no unit-scoped access (onboarding audit F5). An unknown
    // number still approves without one; the review list says so first.
    const [claimedUnit] = await tx
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.communityId, req.communityId),
          isNull(units.deletedAt),
          sql`lower(${units.unitNumber}) = ${unitKey(req.unitIdentifier)}`,
        ),
      )
      .limit(1);

    // Create user_roles row (v3: role='resident' + isUnitOwner flag)
    await tx.insert(userRoles).values({
      userId: req.userId,
      communityId: req.communityId,
      role: 'resident',
      unitId: claimedUnit?.id ?? null,
      isUnitOwner: isOwner,
      displayTitle,
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
          // Pin the community: a member of several lands on whichever sorts
          // first without it, not the one that just let them in.
          actionUrl: `/dashboard?communityId=${req.communityId}`,
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
    requestedResidentType,
    grantedResidentType: isOwner ? 'owner' : 'tenant',
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
