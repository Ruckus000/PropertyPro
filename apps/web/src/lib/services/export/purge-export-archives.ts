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
 * Delete every object directly inside one storage directory.
 *
 * Shared by both public functions so the pagination discipline above cannot
 * drift between them: Supabase Storage `.list()` caps at 1000 rows, and a
 * single unpaginated call silently strands the excess. Re-lists after each
 * removal until a page comes back having removed nothing.
 */
async function removeObjectsIn(
  admin: ReturnType<typeof createAdminClient>,
  dir: string,
  describe: string,
): Promise<number> {
  let deletedCount = 0;

  for (;;) {
    const { data: objects, error: listError } = await admin.storage
      .from(COMMUNITY_EXPORTS_BUCKET)
      .list(dir, { limit: PAGE_SIZE });

    if (listError) {
      throw new Error(`Failed to list ${describe}: ${listError.message}`);
    }
    if (!objects || objects.length === 0) break;

    const paths = objects.map((o) => `${dir}/${o.name}`);
    const { error: removeError } = await admin.storage
      .from(COMMUNITY_EXPORTS_BUCKET)
      .remove(paths);

    if (removeError) {
      throw new Error(`Failed to delete ${describe}: ${removeError.message}`);
    }

    deletedCount += paths.length;
    if (paths.length < PAGE_SIZE) break;
  }

  return deletedCount;
}

/**
 * Remove the archive volumes belonging to ONE export job.
 *
 * The expiry reaper's purge. It used to call `purgeCommunityExportArchives`,
 * which deletes the whole `exports/<communityId>/` tree — so expiring one job
 * destroyed every OTHER job's archive for that community, including a newer
 * `ready` one whose row still said `ready`. That job's download then minted a
 * presigned URL to an object that was no longer there.
 *
 * Keyed on `download_token`, not `job.id`, because that is the segment the
 * writer actually used (`partPath` in export-worker.ts) and it is already
 * carried on the row the reaper selects. Keying on id would strand every
 * archive written before this change.
 *
 * AUTHZ: service-role admin client. Called only from the export worker cron,
 * which has already established the job is terminal.
 *
 * Idempotent: an already-empty prefix returns 0.
 */
export async function purgeExportJobArchive({
  communityId,
  downloadToken,
}: {
  communityId: number;
  downloadToken: string;
}): Promise<{ deletedCount: number }> {
  const admin = createAdminClient();
  const deletedCount = await removeObjectsIn(
    admin,
    `exports/${communityId}/${downloadToken}`,
    `export archive volumes for community ${communityId}`,
  );
  return { deletedCount };
}

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
      removedThisPage += await removeObjectsIn(
        admin,
        `${root}/${dir.name}`,
        `export archives for community ${communityId}`,
      );
    }
    deletedCount += removedThisPage;

    // Nothing left to remove under any listed directory — listing again would
    // return the same empty dirs forever.
    if (removedThisPage === 0) break;
  }

  return { deletedCount };
}
