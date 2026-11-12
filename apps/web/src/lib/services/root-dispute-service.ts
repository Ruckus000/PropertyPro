// AUTHZ: root-dispute/transfer/reassign operations on the root_manager role and
// the root_claim_disputes queue (role-v3 Phase 2b). `openDispute` and
// `transferRoot` are self-authorized by their callers (a property_manager
// disputing; the current root transferring) via explicit membership checks in
// the route handlers; `reassignRoot` is a platform-admin-only operation gated by
// requirePlatformAdmin() in the admin route. transferRoot/reassignRoot use the
// unscoped transaction client (createUnscopedClient) to swap two userRoles rows
// atomically under the one-root partial unique index. This file MUST be added to
// WEB_UNSAFE_IMPORT_ALLOWLIST in scripts/verify-scoped-db-access.ts (both guards
// apply — the #718 two-guard lesson).
// AUTHZ: transferRoot/reassignRoot swap two userRoles rows atomically via the unscoped transaction client under the one-root partial unique index; self-authorized by their route handlers (root-identity / platform-admin gates).
import {
  createUnscopedClient,
  moveBillingOwnershipWithRootTx,
  type BillingOwnershipMove,
} from '@propertypro/db/unsafe';
import {
  createScopedClient,
  logAuditEvent,
  rootClaimDisputes,
  userRoles,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { AppError, ForbiddenError } from '@/lib/api/errors';

export type OpenDisputeResult =
  | { disputed: false; reason: 'no_current_root' }
  | { disputed: true; alreadyOpen: boolean };

/**
 * Open a root-claim dispute for `communityId`, raised by `disputedByUserId` (a
 * property_manager who believes the claim was wrong).
 *
 * - No current root_manager (vacated/transferred/reassigned since the claim
 *   email was sent) → `{ disputed: false, reason: 'no_current_root' }`. We do
 *   NOT insert: `claimed_user_id` is NOT NULL and the dispute is moot.
 * - An open dispute already exists → `{ disputed: true, alreadyOpen: true }`
 *   (idempotent; no duplicate row).
 * - Otherwise insert an `open` row (claimed_user_id = the current root) + audit
 *   `root_claim_disputed`.
 */
export async function openDispute(
  communityId: number,
  disputedByUserId: string,
): Promise<OpenDisputeResult> {
  const scoped = createScopedClient(communityId);

  // Resolve the community's current root_manager.
  const rootRows = (await scoped.selectFrom(
    userRoles,
    {},
    eq(userRoles.role, 'root_manager'),
  )) as Array<Record<string, unknown>>;
  const currentRoot = rootRows[0]?.['userId'] as string | undefined;

  if (!currentRoot) {
    return { disputed: false, reason: 'no_current_root' };
  }

  // Idempotent: an open dispute already exists?
  const existingOpen = (await scoped.selectFrom(
    rootClaimDisputes,
    {},
    eq(rootClaimDisputes.status, 'open'),
  )) as unknown[];
  if (existingOpen.length > 0) {
    return { disputed: true, alreadyOpen: true };
  }

  await scoped.insert(rootClaimDisputes, {
    claimedUserId: currentRoot,
    disputedByUserId,
    status: 'open',
  });

  await logAuditEvent({
    userId: disputedByUserId,
    action: 'root_claim_disputed',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { claimedUserId: currentRoot, status: 'open' },
  });

  return { disputed: true, alreadyOpen: false };
}

/**
 * Transfer root from the current root (`fromUserId`) to `toUserId`, who must
 * already hold a `property_manager` row in the community. Single transaction;
 * demote `from` FIRST then promote `to` so the one-root partial unique index
 * never sees two roots mid-statement.
 *
 * Billing follows root (`moveBillingOwnershipWithRootTx`): when `from` owns the
 * billing group this community is in and is root of nothing else in it, the
 * group passes to `to`. Refused (409, nothing changes) when `to` already owns a
 * different group.
 */
export async function transferRoot(
  communityId: number,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const db = createUnscopedClient();

  const billing = await db.transaction(async (tx): Promise<BillingOwnershipMove> => {
    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // `toUserId` must already be a property_manager here.
    const target = (await scoped.selectFrom(
      userRoles,
      {},
      and(eq(userRoles.userId, toUserId), eq(userRoles.role, 'property_manager')),
    )) as unknown[];
    if (target.length === 0) {
      throw new ForbiddenError(
        'Transfer target must already be a property manager of this community.',
      );
    }

    // Demote the current root FIRST (one-root index ordering).
    await scoped.update(
      userRoles,
      { role: 'property_manager' },
      and(eq(userRoles.userId, fromUserId), eq(userRoles.role, 'root_manager')),
    );

    // Promote the target.
    await scoped.update(
      userRoles,
      { role: 'root_manager' },
      and(eq(userRoles.userId, toUserId), eq(userRoles.role, 'property_manager')),
    );

    // Billing follows root, in the same transaction so a refusal undoes the swap.
    const move = await moveBillingOwnershipWithRootTx(
      tx as unknown as Parameters<typeof moveBillingOwnershipWithRootTx>[0],
      { communityId, fromUserId, toUserId },
    );
    if (move.outcome === 'target_owns_other_group') {
      throw new AppError(
        'This person already pays for another portfolio, so billing for this community can’t move to them. Contact support to combine the two.',
        409,
        'ROOT_TRANSFER_TARGET_OWNS_BILLING_GROUP',
      );
    }
    return move;
  });

  const billingMoved = billing.outcome === 'moved' ? billing.billingGroupId : null;
  await logAuditEvent({
    userId: fromUserId,
    action: 'root_transferred',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    oldValues: { root: fromUserId, ...(billingMoved !== null && { billingGroupOwner: fromUserId }) },
    newValues: {
      root: toUserId,
      ...(billingMoved !== null && { billingGroupOwner: toUserId, billingGroupId: billingMoved }),
    },
  });
}
// Root reassignment (platform-admin) lives in @propertypro/db as `reassignRootOp`
// — the single source of truth shared by the admin route. It is NOT re-exported
// here because the only consumer (the apps/admin reassign-root route) imports it
// directly from @propertypro/db/unsafe.
