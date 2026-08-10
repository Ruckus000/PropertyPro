/**
 * Root-offboarding detection.
 *
 * When a user requests account deletion, we must detect any community where
 * that user is the holder of the `root_manager` role so the platform-admin
 * surface can flag the community as pending-rootless. This is a deliberate
 * cross-community read (root_manager spans communities and is not scoped by
 * the active request's community), so it goes through the unscoped client.
 *
 * R3-03b (2026-08-09): deletion is no longer a silent orphaning. The request now
 * requires an explicit acknowledgement when the user holds root anywhere — see
 * `requestUserDeletion`. It is deliberately NOT a hard block: account deletion
 * is self-scoped and must stay self-service for erasure requests, so the user
 * is informed and consents rather than being refused.
 */
import { communities, userRoles } from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
// AUTHZ: account-lifecycle internal — cross-community read of the deleting user's own root_manager memberships to flag rootless-on-deletion; no tenant context exists for an account-level op.
import { createUnscopedClient } from '@propertypro/db/unsafe';

/** Community ids where `userId` currently holds the `root_manager` role. */
export async function findCommunitiesUserIsRootOf(userId: string): Promise<number[]> {
  const db = createUnscopedClient();
  // user_roles uses hard deletes; the cascade from communities.id removes rows on community deletion, so no deletedAt filter is needed here.
  const rows = await db
    .select({ communityId: userRoles.communityId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'root_manager')));
  return rows.map((r) => r.communityId);
}

/**
 * A community the deleting user is root of, with what the caller needs to warn
 * them usefully.
 */
export interface RootOffboardingCommunity {
  communityId: number;
  /** For the confirmation copy — an id alone tells the user nothing. */
  name: string;
  /**
   * False when no `property_manager` remains who could claim root after the
   * purge. Those communities have NO self-service recovery: `reassignRootOp`
   * requires the target to already be a property_manager, so resolving them is
   * a two-step platform-admin break-glass (promote to PM, then reassign-root).
   * They get their own audit action so the admin rootless report can single
   * them out rather than burying them among the recoverable ones.
   */
  hasSuccessor: boolean;
}

/**
 * Communities `userId` is root of, each with its name and whether a successor
 * exists. Returns [] for the overwhelmingly common case (user holds no root),
 * doing exactly one query in that case.
 */
export async function findRootOffboardingImpact(
  userId: string,
): Promise<RootOffboardingCommunity[]> {
  const communityIds = await findCommunitiesUserIsRootOf(userId);
  if (communityIds.length === 0) return [];

  const db = createUnscopedClient();

  const [nameRows, pmRows] = await Promise.all([
    db
      .select({ id: communities.id, name: communities.name })
      .from(communities)
      .where(inArray(communities.id, communityIds)),
    // Any property_manager in these communities is a potential successor. The
    // deleting user holds root here, not property_manager, so no self-exclusion
    // is needed — a user has one role per community.
    db
      .select({ communityId: userRoles.communityId })
      .from(userRoles)
      .where(
        and(
          inArray(userRoles.communityId, communityIds),
          eq(userRoles.role, 'property_manager'),
        ),
      ),
  ]);

  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const withSuccessor = new Set(pmRows.map((r) => r.communityId));

  return communityIds.map((communityId) => ({
    communityId,
    // A soft-deleted community can still carry the role row; fall back rather
    // than dropping it from the warning entirely.
    name: nameById.get(communityId) ?? `Community ${communityId}`,
    hasSuccessor: withSuccessor.has(communityId),
  }));
}
