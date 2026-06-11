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
import {
  createScopedClient,
  logAuditEvent,
  rootClaimDisputes,
  userRoles,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';

export type OpenDisputeResult =
  | { disputed: false; reason: 'no_current_root' }
  | { disputed: true; alreadyOpen: true }
  | { disputed: true };

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

  return { disputed: true };
}

/**
 * Transfer root from the current root (`fromUserId`) to `toUserId`, who must
 * already hold a `property_manager` row in the community. Single transaction;
 * demote `from` FIRST then promote `to` so the one-root partial unique index
 * never sees two roots mid-statement.
 */
export async function transferRoot(
  communityId: number,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const db = createUnscopedClient();

  await db.transaction(async (tx) => {
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
  });

  await logAuditEvent({
    userId: fromUserId,
    action: 'root_transferred',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    oldValues: { root: fromUserId },
    newValues: { root: toUserId },
  });
}

/**
 * Platform-admin reassignment of root to `newUserId`, who MUST already hold a
 * `property_manager` row in the community (NEVER promote a resident or insert a
 * new row — a resident promotion would trip the prod `chk_owner_flag_resident_only`
 * CHECK and reassign is for managers only). Single transaction: demote the
 * current root (if any) → property_manager, promote `newUserId` → root_manager,
 * resolve any open disputes for the community, audit `root_reassigned`.
 */
export async function reassignRoot(
  communityId: number,
  newUserId: string,
  platformAdminUserId: string,
): Promise<void> {
  const db = createUnscopedClient();

  await db.transaction(async (tx) => {
    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    // `newUserId` must already be a property_manager here.
    const target = (await scoped.selectFrom(
      userRoles,
      {},
      and(eq(userRoles.userId, newUserId), eq(userRoles.role, 'property_manager')),
    )) as unknown[];
    if (target.length === 0) {
      throw new ForbiddenError(
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
      { status: 'resolved', resolvedAt: new Date(), resolvedBy: platformAdminUserId },
      eq(rootClaimDisputes.status, 'open'),
    );
  });

  await logAuditEvent({
    userId: platformAdminUserId,
    action: 'root_reassigned',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { root: newUserId },
  });
}
