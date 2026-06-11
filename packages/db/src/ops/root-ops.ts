/**
 * Root-manager write-ops (role-v3 Phase 2b).
 *
 * Cross-community, unscoped-transaction mutation helpers shared by the web app
 * (apps/web service layer) and the admin app (apps/admin route handlers). Both
 * apps depend on `@propertypro/db`, so the transaction body lives HERE as the
 * single source of truth — including the property_manager-only guard, the
 * demote-then-promote ordering under the one-root partial unique index, the
 * dispute resolution, and the audit log.
 *
 * Exposed only through `@propertypro/db/unsafe` (it uses the unscoped client).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { createScopedClient } from '../scoped-client';
import { logAuditEvent } from '../utils/audit-logger';
import { rootClaimDisputes } from '../schema/root-claim-disputes';
import { userRoles } from '../schema/user-roles';

/**
 * Thrown when the reassignment target does not already hold a `property_manager`
 * row in the community. Callers map this to a 403 (never promote a resident or
 * insert a new row — that would trip the prod `chk_owner_flag_resident_only`
 * CHECK; reassign is for managers only).
 */
export class RoleOpForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleOpForbiddenError';
  }
}

export interface ReassignRootOpParams {
  communityId: number;
  /** The user to promote to root_manager — MUST already be a property_manager. */
  newUserId: string;
  /** The platform admin performing the reassignment (audit + dispute resolver). */
  actingUserId: string;
}

/**
 * Platform-admin reassignment of root to `newUserId`, who MUST already hold a
 * `property_manager` row in the community. Single transaction: demote the
 * current root (if any) → property_manager, promote `newUserId` → root_manager,
 * resolve any open disputes for the community, audit `root_reassigned`.
 *
 * Throws `RoleOpForbiddenError` if `newUserId` is not already a property_manager.
 */
export async function reassignRootOp({
  communityId,
  newUserId,
  actingUserId,
}: ReassignRootOpParams): Promise<void> {
  await db.transaction(async (tx) => {
    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // `newUserId` must already be a property_manager here — never promote a
    // resident or insert a new row (would trip chk_owner_flag_resident_only).
    const target = (await scoped.selectFrom(
      userRoles,
      {},
      and(eq(userRoles.userId, newUserId), eq(userRoles.role, 'property_manager')),
    )) as unknown[];
    if (target.length === 0) {
      throw new RoleOpForbiddenError(
        'No eligible property_manager to promote: the user must already be a property manager of this community.',
      );
    }

    // Demote the current root (if any) FIRST so the one-root index never sees
    // two roots mid-statement.
    await scoped.update(
      userRoles,
      { role: 'property_manager' },
      eq(userRoles.role, 'root_manager'),
    );

    // Promote the new user.
    await scoped.update(
      userRoles,
      { role: 'root_manager' },
      and(eq(userRoles.userId, newUserId), eq(userRoles.role, 'property_manager')),
    );

    // Resolve any open disputes for this community.
    await scoped.update(
      rootClaimDisputes,
      { status: 'resolved', resolvedAt: new Date(), resolvedBy: actingUserId },
      eq(rootClaimDisputes.status, 'open'),
    );
  });

  await logAuditEvent({
    userId: actingUserId,
    action: 'root_reassigned',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { root: newUserId },
  });
}
