/**
 * Delete a community's generated export archives from storage.
 *
 * ── Why this exists ──
 *
 * The async export feature writes a copy of an ENTIRE association — every table
 * plus every uploaded document, including resident PII — into the
 * `community-exports` bucket. `purgeCommunityData` knew nothing about that
 * bucket, so without this the hard-delete path would leave a purged community's
 * complete dataset sitting in storage indefinitely. That is a right-to-erasure
 * failure that the export feature itself would have introduced.
 *
 * Modelled on `@/lib/site-assets/cleanup`, including its pagination lesson:
 * Supabase Storage `.list()` returns at most 1000 rows per page, and a single
 * unpaginated call silently strands the excess. The lifecycle cron marks a
 * deletion request `purged` on success and never retries, so anything missed
 * here is missed permanently.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { COMMUNITY_EXPORTS_BUCKET } from '@propertypro/db';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const PAGE_SIZE = 1000;

/**
 * Remove every export object under `exports/<communityId>/`.
 *
 * AUTHZ: caller MUST have verified the community is being hard-deleted —
 * this is invoked from `purgeCommunityData` in the account-lifecycle cron only.
 * Uses the service-role admin client because the community's members no longer
 * exist by this point, so RLS would block any scoped path.
 *
 * Idempotent: re-running against an already-empty prefix returns 0.
 */
export async function purgeCommunityExportArchives(
  communityId: number,
): Promise<{ deletedCount: number }> {
  const admin = createAdminClient();
  const root = `exports/${communityId}`;
  let deletedCount = 0;

  // Each job writes under its own download-token directory, so the tree is
  // exports/<communityId>/<token>/part-000.zip. List the token dirs, then the
  // objects inside each.
  //
  // Paginated the same way as site-assets cleanup: re-list after each removal
  // until a page comes back short. A single .list() would cap at 1000 and leave
  // the rest stranded forever.
  for (;;) {
    const { data: tokenDirs, error: listError } = await admin.storage
      .from(COMMUNITY_EXPORTS_BUCKET)
      .list(root, { limit: PAGE_SIZE });

    if (listError) {
      throw new Error(
        `Failed to list export archives for community ${communityId}: ${listError.message}`,
      );
    }
    if (!tokenDirs || tokenDirs.length === 0) break;

    let removedThisPage = 0;

    for (const dir of tokenDirs) {
      const { data: objects, error: objectsError } = await admin.storage
        .from(COMMUNITY_EXPORTS_BUCKET)
        .list(`${root}/${dir.name}`, { limit: PAGE_SIZE });

      if (objectsError) {
        throw new Error(
          `Failed to list export archive parts for community ${communityId}: ${objectsError.message}`,
        );
      }
      if (!objects || objects.length === 0) continue;

      const paths = objects.map((o) => `${root}/${dir.name}/${o.name}`);
      const { error: removeError } = await admin.storage
        .from(COMMUNITY_EXPORTS_BUCKET)
        .remove(paths);

      if (removeError) {
        throw new Error(
          `Failed to delete export archives for community ${communityId}: ${removeError.message}`,
        );
      }

      deletedCount += paths.length;
      removedThisPage += paths.length;
    }

    // Nothing left to remove under any listed directory — listing again would
    // return the same empty dirs forever.
    if (removedThisPage === 0) break;
  }

  return { deletedCount };
}
