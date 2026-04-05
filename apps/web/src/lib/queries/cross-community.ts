/**
 * Cross-community query helpers.
 *
 * Authorization boundary: these helpers query across all communities a user
 * belongs to. Callers MUST have authenticated the user via
 * `requireAuthenticatedUserId()` before invoking. The helpers only return data
 * scoped to the user's own membership rows.
 */
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';

/**
 * Returns the ids of all non-deleted communities the user belongs to.
 * The user is the authorization anchor — all returned ids are scoped to their
 * own `user_roles` rows.
 */
export async function getAuthorizedCommunityIds(userId: string): Promise<number[]> {
  const rows = await findUserCommunitiesUnscoped(userId);
  const ids = new Set<number>();
  for (const row of rows) {
    ids.add(row.communityId);
  }
  return [...ids];
}
