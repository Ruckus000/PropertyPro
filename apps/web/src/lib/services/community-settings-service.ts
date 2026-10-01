/**
 * The one writer for `communities.community_settings` in the web app.
 *
 * The column is a JSONB blob shared by unrelated features (fee policy, visitor
 * revoke, write levels, legal gates, …). Writers MERGE in SQL —
 * `coalesce(col, '{}') || patch` — so a write can only ever touch the keys it
 * names, and two concurrent writers of different keys cannot erase each
 * other (a read-modify-write in JS could).
 */
import { communities, createScopedClient } from '@propertypro/db';
import { eq, sql } from '@propertypro/db/filters';

/**
 * AUTHZ: caller MUST have verified the actor may change these settings for
 * `communityId` (each key has its own gate — e.g. finance admin for the fee policy).
 */
export async function mergeCommunitySettings(
  communityId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    communities,
    {
      communitySettings: sql`coalesce(${communities.communitySettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    },
    eq(communities.id, communityId),
  );
}
