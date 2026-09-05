/**
 * PR #2: Site assets cleanup helpers.
 *
 * Called by the account-lifecycle cron when a community is hard-deleted.
 * Uses the service-role admin client to bypass RLS (which would otherwise
 * require the deleting user's membership to still exist).
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { SITE_ASSETS_BUCKET, SITE_ASSET_KINDS } from './storage-paths';

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
  // immediate children of a path. We need to walk the tree for each kind to
  // find every object.
  //
  // The kinds are DERIVED from SITE_ASSET_KINDS, never restated here. This loop
  // used to carry its own `['logo', 'hero', 'content']`, which had silently
  // fallen one kind behind the writer: every purged community left its favicon
  // objects (`{id}/favicon/*.32.png`, `*.180.png`) in the bucket forever, and
  // because the cron marks the request 'purged' on success and never retries,
  // "forever" is literal. Nothing failed when the two lists drifted, so the fix
  // is to make them the same list rather than to lengthen this one.
  //
  // One level per kind is sufficient, and that is a property of the path
  // format rather than an assumption: buildSiteAssetPath guarantees exactly
  // three segments, and a variant suffix (`.1600w.webp`, `.32.png`) lands on
  // the FILENAME segment, so every object is an immediate child of
  // `{communityId}/{kind}`. storage-paths.test.ts asserts that for favicons.
  //
  // Supabase Storage `.list()` is limited to 1000 results per page. The
  // previous implementation issued a single .list() call per kind, so any
  // community with > 1000 surviving objects under one kind directory would
  // leave the excess permanently stranded in the bucket after hard-delete
  // (the lifecycle cron marks the deletion request 'purged' on success and
  // never retries). That's a GDPR right-to-erasure failure. Paginate via
  // re-list-after-remove until a page returns fewer than PAGE_SIZE rows.
  const PAGE_SIZE = 1000;
  let deletedCount = 0;
  for (const kind of SITE_ASSET_KINDS) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: items, error: listErr } = await admin.storage
        .from(SITE_ASSETS_BUCKET)
        .list(`${communityId}/${kind}`, { limit: PAGE_SIZE });

      if (listErr) {
        // 'not found' is acceptable — community had no assets of this kind.
        if (listErr.message.includes('not found') || listErr.message.includes('Not Found')) break;
        throw new Error(`Failed to list ${prefix}${kind}: ${listErr.message}`);
      }

      if (!items || items.length === 0) break;

      const paths = items.map((item) => `${communityId}/${kind}/${item.name}`);
      const { error: removeErr } = await admin.storage
        .from(SITE_ASSETS_BUCKET)
        .remove(paths);

      if (removeErr) {
        throw new Error(`Failed to remove ${prefix}${kind} objects: ${removeErr.message}`);
      }

      deletedCount += items.length;

      // Final page — short-circuit before issuing another list() call.
      if (items.length < PAGE_SIZE) break;
    }
  }

  return { deletedCount };
}
