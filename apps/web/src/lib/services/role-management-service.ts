/**
 * role-management-service.ts
 *
 * Single-community role operations: assign/revoke property_manager,
 * set/clear board designations. All mutations go through the scoped
 * client (createScopedClient) — no cross-community access.
 *
 * Phase 2c of the role-simplification program.
 */

import { createScopedClient, logAuditEvent, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import type { CommunityType } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Exported error class
// ---------------------------------------------------------------------------

export class NonOwnerAckRequiredError extends Error {
  constructor() {
    super('Board eligibility acknowledgement required for a non-owner.');
    this.name = 'NonOwnerAckRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AssignResult {
  assigned: true;
  alreadyAssigned: boolean;
}

export interface RevokeResult {
  revoked: boolean;
  reason?: 'not_a_property_manager';
}

export type Designation = 'board_president' | 'board_member';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function roleOf(
  scoped: ReturnType<typeof createScopedClient>,
  userId: string,
): Promise<{ role: string; isUnitOwner: boolean } | null> {
  const rows = await scoped.queryWhere(userRoles, eq(userRoles.userId, userId)) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    role: row['role'] as string,
    isUnitOwner: row['isUnitOwner'] === true,
  };
}

// ---------------------------------------------------------------------------
// assignPropertyManager
// ---------------------------------------------------------------------------

/**
 * Promote `targetUserId` to `property_manager` within `communityId`.
 *
 * - If the target is already a property_manager → idempotent no-op.
 * - If the target is the root_manager → ForbiddenError.
 * - If the target is not a community member → ValidationError.
 */
export async function assignPropertyManager(
  communityId: number,
  targetUserId: string,
  actorUserId: string,
): Promise<AssignResult> {
  const scoped = createScopedClient(communityId);

  const current = await roleOf(scoped, targetUserId);
  if (!current) {
    throw new ValidationError('Target is not a member of this community.');
  }

  if (current.role === 'root_manager') {
    throw new ForbiddenError('Cannot change the root manager here — use Transfer root.');
  }

  if (current.role === 'property_manager') {
    return { assigned: true, alreadyAssigned: true };
  }

  await scoped.update(
    userRoles,
    // Clear any board designation on promotion: property managers are
    // administrative staff and cannot hold a governance board seat, so a member
    // promoted from a board_president/board_member resident must not retain it.
    { role: 'property_manager', isUnitOwner: false, designation: null },
    eq(userRoles.userId, targetUserId),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'role_assigned',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { userId: targetUserId, role: 'property_manager' },
  });

  return { assigned: true, alreadyAssigned: false };
}

// ---------------------------------------------------------------------------
// revokePropertyManager
// ---------------------------------------------------------------------------

/**
 * Demote `targetUserId` from `property_manager` back to `resident`.
 *
 * - If the target is not a property_manager → no-op with reason.
 * - If the target is the root_manager → ForbiddenError.
 */
export async function revokePropertyManager(
  communityId: number,
  targetUserId: string,
  actorUserId: string,
): Promise<RevokeResult> {
  const scoped = createScopedClient(communityId);

  const current = await roleOf(scoped, targetUserId);
  if (!current) {
    return { revoked: false, reason: 'not_a_property_manager' };
  }

  if (current.role === 'root_manager') {
    throw new ForbiddenError('Transfer root before changing the root manager.');
  }

  if (current.role !== 'property_manager') {
    return { revoked: false, reason: 'not_a_property_manager' };
  }

  // isUnitOwner: false is intentional and spec-mandated. The prior owner/tenant status was
  // overwritten when the user was promoted to property_manager; 2c does not guess it back.
  // The root_manager corrects ownership afterward via the residents page if needed.
  await scoped.update(
    userRoles,
    { role: 'resident', isUnitOwner: false },
    eq(userRoles.userId, targetUserId),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'role_revoked',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { userId: targetUserId, role: 'resident' },
  });

  return { revoked: true };
}

// ---------------------------------------------------------------------------
// setDesignation
// ---------------------------------------------------------------------------

/**
 * Set or clear a board designation (board_member | board_president | null)
 * for `targetUserId` within `communityId`.
 *
 * - Apartment communities have no board → ValidationError.
 * - Non-owner targets require explicit `acknowledgeNonOwner=true`.
 * - board_president is unique: the existing president's designation is cleared
 *   first (sequential updates; the scoped client has no .transaction()).
 */
export async function setDesignation(
  communityId: number,
  communityType: CommunityType,
  targetUserId: string,
  designation: Designation | null,
  acknowledgeNonOwner: boolean,
  actorUserId: string,
): Promise<{ ok: true }> {
  if (communityType === 'apartment') {
    throw new ValidationError('Apartment communities have no board.');
  }

  const scoped = createScopedClient(communityId);

  const current = await roleOf(scoped, targetUserId);
  if (!current) {
    throw new ValidationError('Target is not a member of this community.');
  }

  // Non-owner ack gate (only when assigning a designation, not clearing)
  if (
    designation !== null &&
    current.role === 'resident' &&
    !current.isUnitOwner &&
    !acknowledgeNonOwner
  ) {
    throw new NonOwnerAckRequiredError();
  }

  if (designation === 'board_president') {
    // Clear the existing board_president first, then set the new one.
    // Sequential (no transaction) — safe because the partial unique index
    // only blocks two non-null rows; clearing first ensures that invariant.
    await scoped.update(
      userRoles,
      { designation: null },
      eq(userRoles.designation, 'board_president'),
    );
    await scoped.update(
      userRoles,
      { designation: 'board_president' },
      eq(userRoles.userId, targetUserId),
    );
  } else {
    await scoped.update(
      userRoles,
      { designation },
      eq(userRoles.userId, targetUserId),
    );
  }

  await logAuditEvent({
    userId: actorUserId,
    action: designation === null ? 'designation_cleared' : 'designation_set',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { userId: targetUserId, designation },
  });

  return { ok: true };
}
