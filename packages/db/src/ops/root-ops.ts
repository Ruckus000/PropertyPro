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
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../drizzle';
import { createScopedClient } from '../scoped-client';
import { logAuditEvent } from '../utils/audit-logger';
import { billingGroups } from '../schema/billing-groups';
import { communities } from '../schema/communities';
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BillingOwnershipMove =
  | { outcome: 'moved'; billingGroupId: number; previousOwnerUserId: string }
  | { outcome: 'kept' }
  | { outcome: 'target_owns_other_group'; billingGroupId: number };

/**
 * Thrown by `reassignRootOp` when billing cannot follow root because the new
 * root already owns a different billing group. Nothing is changed. Callers map
 * it to a 409.
 */
export class RootOpConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RootOpConflictError';
  }
}

/** True when `userId` holds any of `roles` in a live community of `groupId`. */
async function holdsRoleInGroupTx(
  tx: Tx,
  userId: string,
  groupId: number,
  roles: Array<'root_manager' | 'property_manager'>,
): Promise<boolean> {
  const rows = await tx
    .select({ communityId: userRoles.communityId })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.userId, userId),
        inArray(userRoles.role, roles),
        eq(communities.billingGroupId, groupId),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Billing follows root. Call inside every root change's transaction (transfer,
 * platform-admin reassign, claim), AFTER the role rows are written. When the
 * community is billed to a live group, the group passes to `toUserId` in two
 * cases:
 *
 *   - Hand-off: the owner is the outgoing root (`fromUserId`) and is now root
 *     of no community in the group. While they are still root elsewhere in it
 *     the group stays theirs, so one change never hands over billing for
 *     communities it did not touch.
 *   - Orphaned: the owner manages no live community in the group at all (their
 *     account was deleted, or they were removed). Without this, nobody could
 *     ever add to the portfolio again. An owner who still manages a community
 *     in it keeps the group, even when they are not root.
 *
 * Returns `target_owns_other_group` without writing when `toUserId` already
 * owns a different group: one person owning two groups makes "which portfolio
 * does an add join?" unanswerable, so the caller decides whether to refuse.
 */
export async function moveBillingOwnershipWithRootTx(
  tx: Tx,
  input: { communityId: number; fromUserId: string | null; toUserId: string },
): Promise<BillingOwnershipMove> {
  const [group] = await tx
    .select({ id: billingGroups.id, ownerUserId: billingGroups.ownerUserId })
    .from(communities)
    .innerJoin(billingGroups, eq(billingGroups.id, communities.billingGroupId))
    .where(and(eq(communities.id, input.communityId), isNull(billingGroups.deletedAt)))
    .limit(1);
  if (!group || group.ownerUserId === input.toUserId) return { outcome: 'kept' };
  const groupId = Number(group.id);

  const ownerKeeps =
    group.ownerUserId === input.fromUserId
      ? await holdsRoleInGroupTx(tx, group.ownerUserId, groupId, ['root_manager'])
      : await holdsRoleInGroupTx(tx, group.ownerUserId, groupId, ['root_manager', 'property_manager']);
  if (ownerKeeps) return { outcome: 'kept' };

  const otherGroup = await tx
    .select({ id: billingGroups.id })
    .from(billingGroups)
    .where(
      and(
        eq(billingGroups.ownerUserId, input.toUserId),
        isNull(billingGroups.deletedAt),
        ne(billingGroups.id, groupId),
      ),
    )
    .limit(1);
  if (otherGroup.length > 0) return { outcome: 'target_owns_other_group', billingGroupId: groupId };

  await tx
    .update(billingGroups)
    .set({ ownerUserId: input.toUserId, updatedAt: new Date() })
    .where(eq(billingGroups.id, groupId));
  return { outcome: 'moved', billingGroupId: groupId, previousOwnerUserId: group.ownerUserId };
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
 * resolve any open disputes, move billing with root
 * (`moveBillingOwnershipWithRootTx`), audit `root_reassigned`.
 *
 * Throws `RoleOpForbiddenError` if `newUserId` is not already a property_manager,
 * and `RootOpConflictError` (nothing changed) when billing should follow root
 * but `newUserId` already owns another billing group.
 */
export async function reassignRootOp({
  communityId,
  newUserId,
  actingUserId,
}: ReassignRootOpParams): Promise<void> {
  const { outgoingRoot, billing } = await db.transaction(async (tx) => {
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

    const currentRoots = (await scoped.selectFrom(
      userRoles,
      {},
      eq(userRoles.role, 'root_manager'),
    )) as Array<{ userId: string }>;
    const outgoingRoot = currentRoots[0]?.userId ?? null;

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

    // Billing follows root, in the same transaction so a refusal undoes the swap.
    const billing = await moveBillingOwnershipWithRootTx(tx, {
      communityId,
      fromUserId: outgoingRoot,
      toUserId: newUserId,
    });
    if (billing.outcome === 'target_owns_other_group') {
      throw new RootOpConflictError(
        'The new root already pays for another portfolio, so billing for this community cannot move to them. Combine the two billing groups first.',
      );
    }
    return { outgoingRoot, billing };
  });

  await logAuditEvent({
    userId: actingUserId,
    action: 'root_reassigned',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    ...(billing.outcome === 'moved' && {
      oldValues: { root: outgoingRoot, billingGroupOwner: billing.previousOwnerUserId },
    }),
    newValues: {
      root: newUserId,
      ...(billing.outcome === 'moved' && {
        billingGroupOwner: newUserId,
        billingGroupId: billing.billingGroupId,
      }),
    },
  });
}

/**
 * The claim itself, for `claimRoot` in the web service layer (which checks the
 * caller is a property_manager of a rootless community first): flip their row to
 * root_manager and move billing with root, in one transaction.
 *
 * A concurrent winner surfaces as the one-root index's 23505, rethrown for the
 * caller to report as `already_claimed`. When the claimer already owns another
 * billing group the claim still succeeds and billing stays put: refusing would
 * leave the community with no root at all.
 */
export async function claimRootOp(
  communityId: number,
  userId: string,
): Promise<BillingOwnershipMove> {
  return db.transaction(async (tx) => {
    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );
    await scoped.update(
      userRoles,
      { role: 'root_manager' },
      and(eq(userRoles.userId, userId), eq(userRoles.role, 'property_manager')),
    );
    return moveBillingOwnershipWithRootTx(tx, { communityId, fromUserId: null, toUserId: userId });
  });
}
