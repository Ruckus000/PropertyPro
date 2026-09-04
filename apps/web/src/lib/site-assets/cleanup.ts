/**
 * Storage cleanup for a hard-deleted community.
 *
 * Called by the account-lifecycle cron. Uses the service-role admin client to
 * bypass RLS, which would otherwise require the deleting user's membership to
 * still exist.
 *
 * Two buckets are swept, and both are "community website assets" — the exact
 * category the ToS says the purge step deletes:
 *
 *   community-site-assets   the site editor's own uploads  ({id}/{kind}/…)
 *   community-assets        the admin console's uploads    ({id}/site/…)
 *
 * Nothing else is swept, deliberately. The `documents` and `maintenance`
 * buckets hold association records — the privacy policy names uploaded
 * documents AND maintenance requests as content retained beyond the purge,
 * because it is "the association's record, not yours alone". Adding either
 * here would contradict a live policy, not close a gap.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { COMMUNITY_ASSETS_BUCKET } from '@propertypro/db/constants';
import { SITE_ASSETS_BUCKET, SITE_ASSET_KINDS } from './storage-paths';

/** Supabase Storage `.list()` returns at most this many objects per page. */
const PAGE_SIZE = 1000;

/**
 * Delete every object directly under each of `prefixes`, paginating.
 *
 * Shared by both sweeps rather than written twice, because the pagination is
 * the part that is easy to get wrong and expensive when you do. `.list()` caps
 * at 1000 per page, and an earlier single-call implementation left every object
 * past that limit permanently stranded — the cron marks the request `purged` on
 * success and never retries, so "stranded" means forever. A second sweep that
 * restated the walk would be one edit away from reintroducing exactly that.
 *
 * One level per prefix is sufficient for both callers, and that is a property
 * of the path formats rather than an assumption: `{id}/{kind}/{file}` and
 * `{id}/site/{file}` are both three segments, with any variant suffix
 * (`.1600w.webp`, `.32.png`) landing on the FILENAME segment. So every object
 * is an immediate child of its prefix. `storage-paths.test.ts` asserts that for
 * the favicon variants, which are the least obvious case.
 *
 * Throws on any list or remove failure except a missing prefix, so a partial
 * sweep aborts `purgeCommunityData` before it flips the request to `purged`
 * and the work stays retryable.
 */
async function purgePrefixes(
  bucket: string,
  prefixes: readonly string[],
): Promise<{ deletedCount: number }> {
  const admin = createAdminClient();
  let deletedCount = 0;

  for (const prefix of prefixes) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: items, error: listErr } = await admin.storage
        .from(bucket)
        .list(prefix, { limit: PAGE_SIZE });

      if (listErr) {
        // 'not found' is acceptable — the community had no objects here.
        if (listErr.message.includes('not found') || listErr.message.includes('Not Found')) break;
        throw new Error(`Failed to list ${prefix}: ${listErr.message}`);
      }

      if (!items || items.length === 0) break;

      const paths = items.map((item) => `${prefix}/${item.name}`);
      const { error: removeErr } = await admin.storage.from(bucket).remove(paths);

      if (removeErr) {
        throw new Error(`Failed to remove ${prefix} objects: ${removeErr.message}`);
      }

      deletedCount += items.length;

      // Final page — short-circuit before issuing another list() call.
      if (items.length < PAGE_SIZE) break;
    }
  }

  return { deletedCount };
}

/**
 * Delete every object in `community-site-assets` for this community.
 *
 * The kinds are DERIVED from SITE_ASSET_KINDS, never restated. This loop used
 * to carry its own `['logo', 'hero', 'content']`, which had silently fallen one
 * kind behind the writer, so every purged community left its favicon objects in
 * the bucket forever. The fix was to make the two the same list rather than to
 * lengthen this one.
 *
 * AUTHZ: caller MUST have verified the community is being hard-deleted
 * (`purgeCommunityData` is called from the account-lifecycle cron only).
 *
 * Returns the number of objects deleted. Idempotent: re-running returns 0.
 */
export async function purgeCommunitySiteAssets(
  communityId: number,
): Promise<{ deletedCount: number }> {
  return purgePrefixes(
    SITE_ASSETS_BUCKET,
    SITE_ASSET_KINDS.map((kind) => `${communityId}/${kind}`),
  );
}

/**
 * Delete every object in `community-assets` for this community — the logos and
 * site imagery uploaded through the admin console, at `{id}/site/{uuid}.{ext}`.
 *
 * Note the bucket names: `community-assets` is NOT `community-site-assets`.
 * They differ by one word and hold different uploads from different surfaces,
 * and until this existed only the second was ever purged — so a community's
 * admin-uploaded website imagery survived its own deletion indefinitely, in a
 * PUBLIC bucket. The ToS says the purge step deletes "community website
 * assets"; these are exactly that.
 *
 * AUTHZ and idempotency: as above.
 */
export async function purgeCommunityAdminAssets(
  communityId: number,
): Promise<{ deletedCount: number }> {
  return purgePrefixes(COMMUNITY_ASSETS_BUCKET, [`${communityId}/site`]);
}
