/**
 * Root-offboarding detection.
 *
 * When a user requests account deletion, we must detect any community where
 * that user is the holder of the `root_manager` role so the platform-admin
 * surface can flag the community as pending-rootless. This is a deliberate
 * cross-community read (root_manager spans communities and is not scoped by
 * the active request's community), so it goes through the unscoped client.
 *
 * Phase 2a only FLAGS (audit event) — it does not hard-block. Phase 3 will
 * block once the claim/transfer UX (2b) exists.
 */
import { userRoles } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
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
