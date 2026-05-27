/**
 * PR #2: Site assets cleanup helpers.
 *
 * Called by the account-lifecycle cron when a community is hard-deleted.
 * Uses the service-role admin client to bypass RLS (which would otherwise
 * require the deleting user's membership to still exist).
 */
import { createAdminClient } from '@propertypro/db';
import { SITE_ASSETS_BUCKET } from './storage-paths';

/**
 * Delete every object in community-site-assets under the given community's
 * path prefix. Uses the admin client (service role) so RLS doesn't block
 * the operation when the community's PMs have already been soft-deleted.
 *
 * AUTHZ: caller MUST have verified the community is being hard-deleted
 * (purgeCommunityData is called from the account-lifecycle cron only).
 *
 * Returns the number of objects deleted. Idempotent: re-running returns 0.
 */
export async function purgeCommunitySiteAssets(communityId: number): Promise<{ deletedCount: number }> {
  const admin = createAdminClient();
  const prefix = `${communityId}/`;

  // Storage list() doesn't accept arbitrary prefixes — it lists the
  // immediate children of a path. We need to walk the tree for each kind
  // ('logo', 'hero', 'content') to find every object.
  let deletedCount = 0;
  for (const kind of ['logo', 'hero', 'content'] as const) {
    const { data: items, error: listErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .list(`${communityId}/${kind}`, { limit: 1000 });

    if (listErr) {
      // 'not found' is acceptable — community had no assets of this kind.
      if (listErr.message.includes('not found') || listErr.message.includes('Not Found')) continue;
      throw new Error(`Failed to list ${prefix}${kind}: ${listErr.message}`);
    }

    if (!items || items.length === 0) continue;

    const paths = items.map((item) => `${communityId}/${kind}/${item.name}`);
    const { error: removeErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .remove(paths);

    if (removeErr) {
      throw new Error(`Failed to remove ${prefix}${kind} objects: ${removeErr.message}`);
    }

    deletedCount += items.length;
  }

  return { deletedCount };
}
