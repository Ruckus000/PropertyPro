/**
 * Site-assets usage reconciler — REPORT ONLY. Deletes nothing, ever.
 *
 * ## The problem
 *
 * `communities.branding.assetsBytesUsed` is a one-way ratchet.
 * `incrementAssetsUsage` is called when an image finalizes
 * (`site/images/finalize`, `site/images/finalize-favicon`). Nothing decrements
 * it when a PM removes a hero photo or a gallery image: the block content
 * stops referencing the object, the object stays in the bucket, and the
 * counter never moves. The only deletion path is `purgeCommunitySiteAssets`
 * on community hard-delete.
 *
 * Essentials is 100 MB. Exhaustion is a 413 at presign with no self-service
 * remedy — the PM cannot free space by deleting photos, because deleting
 * photos does not reduce the number the quota gate reads.
 *
 * ## Why not just decrement on remove
 *
 * Because draft and published rows can both reference the same object. A PM
 * who removes a photo from the draft has not removed it from the live site,
 * and decrementing there under-counts: the bytes are still stored, the counter
 * says otherwise, and the community is now able to exceed its real usage. The
 * reference set is a property of ALL live rows together, not of the edit that
 * happened to touch one.
 *
 * So: reconcile against reality instead. This script computes three numbers
 * per community and reports the drift between them.
 *
 *   counter     `branding.assetsBytesUsed` — what the quota gate believes
 *   actual      sum of every object under `{communityId}/` in the bucket
 *   referenced  sum of the objects some live row still points at
 *
 * `counter` should equal `actual`: the quota is about bytes stored, and an
 * orphan occupies space whether or not anything links to it.
 * `actual - referenced` is the reclaimable amount — the number that sizes the
 * separate, and deliberately deferred, decision about deleting orphaned bytes.
 *
 * ## Two separate decisions
 *
 * 1. *Make the counter accurate.* Safe, reversible, opt-in here via
 *    `--apply-counter`. It cannot lose data; worst case it is re-run.
 * 2. *Delete orphaned bytes.* NOT implemented. It is destructive and
 *    irreversible, the orphan set depends on this script's reference model
 *    being complete, and it needs a human looking at real numbers first. Run
 *    the report, read it, then decide.
 *
 * ## Reference model
 *
 * Both draft AND published non-deleted `site_blocks` rows count. A path
 * referenced by either is live.
 *
 *   image     content.imagePath
 *   gallery   content.images[].imagePath
 *   hero      content.photos[].path, content.heroImagePath
 *   branding  favicon.icon32Path, favicon.appleTouch180Path
 *
 * Block paths are stored as the BASE path, and `finalize` deletes the raw
 * upload at that base path after writing `{path}.1600w.webp` and
 * `{path}.800w.webp`. So each referenced base path expands to its two
 * variants; comparing base paths directly against the bucket would classify
 * every real asset as an orphan and every real object as unreferenced.
 * Favicon paths are stored already-processed and are used as-is.
 *
 * `branding.logoPath` / `siteLogoPath` are deliberately absent: those live in
 * the `documents` bucket via the branding upload flow, not in
 * `community-site-assets`.
 *
 * Known reporting caveat: `{id}/logo/...` objects, if any legacy ones exist,
 * have no reference source here and will be reported as orphan candidates.
 * That is accurate — nothing references them — but worth knowing before
 * anyone acts on the orphan list.
 */
import { sql } from '@propertypro/db/filters';
// Operator-run maintenance CLI, never reachable from a request path. It compares
// the whole community-site-assets bucket against every tenant's rows, so a
// per-tenant scoped client cannot express the query by construction.
// AUTHZ: Cross-tenant site-assets usage reconciliation; operator-run CLI, no request path.
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { applyAssetsUsageDelta } from '@/lib/site-assets/quota';
import { SITE_ASSETS_BUCKET } from '@/lib/site-assets/public-url';
import {
  expandToStoredObjects,
  referencedBasePaths,
  referencedBrandingPaths,
} from './lib/site-assets-reference-model';

export interface CommunityReport {
  communityId: number;
  slug: string;
  counterBytes: number;
  actualBytes: number;
  referencedBytes: number;
  objectCount: number;
  orphanCount: number;
  orphanBytes: number;
  /** actualBytes - counterBytes. Positive = counter under-reports storage. */
  counterDriftBytes: number;
  orphanPaths: string[];
}

export interface ReconcileOptions {
  db?: ReturnType<typeof createUnscopedClient>;
  /**
   * Ignore objects created less than this many hours ago. An upload that is
   * mid-flight — presigned and PUT, not yet finalized — is legitimately
   * unreferenced, and calling it an orphan would race the request that is
   * about to reference it. Default 24.
   */
  maxAgeHours?: number;
  /**
   * Abort if more than this many communities show drift. A number this large
   * means the reference model is wrong, not that every community drifted.
   * Default 500.
   */
  safetyCap?: number;
  /** Correct `branding.assetsBytesUsed` to match actual bucket bytes. */
  applyCounter?: boolean;
  log?: (message: string) => void;
}

export interface ReconcileResult {
  reports: CommunityReport[];
  countersUpdated: number;
  applied: boolean;
}

export async function reconcileSiteAssetsUsage(
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const {
    maxAgeHours = 24,
    safetyCap = 500,
    applyCounter = false,
    log = () => {},
  } = options;

  const db = options.db ?? createUnscopedClient();

  // Objects grouped by their leading path segment, which IS the community id
  // (enforced on write by assertPathsScopedToCommunity + parseSiteAssetPath).
  const objectRows = (await db.execute(sql`
    SELECT
      split_part(name, '/', 1) AS community_segment,
      name,
      COALESCE((metadata ->> 'size')::bigint, 0) AS bytes,
      created_at
    FROM storage.objects
    WHERE bucket_id = ${SITE_ASSETS_BUCKET}
  `)) as unknown as Array<{
    community_segment: string;
    name: string;
    bytes: string | number;
    created_at: Date | string;
  }>;

  const communityRows = (await db.execute(sql`
    SELECT id, slug, COALESCE((branding ->> 'assetsBytesUsed')::bigint, 0) AS counter_bytes, branding
    FROM communities
    WHERE deleted_at IS NULL
  `)) as unknown as Array<{
    id: number;
    slug: string;
    counter_bytes: string | number;
    branding: unknown;
  }>;

  const blockRows = (await db.execute(sql`
    SELECT community_id, block_type, content
    FROM site_blocks
    WHERE deleted_at IS NULL
  `)) as unknown as Array<{ community_id: number; block_type: string; content: unknown }>;

  const referencedByCommunity = new Map<number, Set<string>>();
  const addReferences = (communityId: number, paths: Iterable<string>) => {
    let set = referencedByCommunity.get(communityId);
    if (!set) {
      set = new Set<string>();
      referencedByCommunity.set(communityId, set);
    }
    for (const path of paths) set.add(path);
  };

  for (const row of blockRows) {
    addReferences(
      Number(row.community_id),
      expandToStoredObjects(referencedBasePaths(row.block_type, row.content)),
    );
  }
  for (const row of communityRows) {
    addReferences(Number(row.id), referencedBrandingPaths(row.branding));
  }

  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const reports: CommunityReport[] = [];

  for (const community of communityRows) {
    const communityId = Number(community.id);
    const counterBytes = Number(community.counter_bytes);
    const objects = objectRows.filter((o) => o.community_segment === String(communityId));
    if (objects.length === 0 && counterBytes === 0) continue;

    const referenced = referencedByCommunity.get(communityId) ?? new Set<string>();
    let actualBytes = 0;
    let referencedBytes = 0;
    let orphanBytes = 0;
    const orphanPaths: string[] = [];

    for (const object of objects) {
      const bytes = Number(object.bytes);
      actualBytes += bytes;
      if (referenced.has(object.name)) {
        referencedBytes += bytes;
        continue;
      }
      // Too new to judge: a presigned upload may not have finalized yet.
      if (new Date(object.created_at).getTime() > cutoff) continue;
      orphanBytes += bytes;
      orphanPaths.push(object.name);
    }

    reports.push({
      communityId,
      slug: community.slug,
      counterBytes,
      actualBytes,
      referencedBytes,
      objectCount: objects.length,
      orphanCount: orphanPaths.length,
      orphanBytes,
      counterDriftBytes: actualBytes - counterBytes,
      orphanPaths,
    });
  }

  const drifted = reports.filter((r) => r.counterDriftBytes !== 0);
  if (drifted.length > safetyCap) {
    throw new Error(
      `reconcile aborted: ${drifted.length} communities show counter drift, exceeding safetyCap ${safetyCap} — ` +
        'that many usually means the reference model is wrong, not that every community drifted',
    );
  }

  let countersUpdated = 0;
  if (applyCounter) {
    for (const report of drifted) {
      // Delta, not absolute set: a finalize landing between the read above and
      // this write keeps its increment.
      await applyAssetsUsageDelta(report.communityId, report.counterDriftBytes);
      countersUpdated += 1;
      log(
        `updated counter for ${report.slug} (#${report.communityId}): ` +
          `${report.counterBytes} -> ${report.actualBytes} (${signed(report.counterDriftBytes)})`,
      );
    }
  }

  return { reports, countersUpdated, applied: applyCounter };
}

function signed(bytes: number): string {
  return bytes >= 0 ? `+${bytes}` : String(bytes);
}

function mib(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function printReport(result: ReconcileResult): void {
  const interesting = result.reports.filter(
    (r) => r.counterDriftBytes !== 0 || r.orphanCount > 0,
  );

  console.log(`\nScanned ${result.reports.length} communities with site assets.\n`);

  if (interesting.length === 0) {
    console.log('✅ No counter drift and no orphaned objects.\n');
    return;
  }

  for (const r of interesting) {
    console.log(`${r.slug} (#${r.communityId})`);
    console.log(`  counter    ${mib(r.counterBytes)}  (what the quota gate reads)`);
    console.log(`  actual     ${mib(r.actualBytes)}  across ${r.objectCount} objects`);
    console.log(`  referenced ${mib(r.referencedBytes)}  still pointed at by a live row`);
    if (r.counterDriftBytes !== 0) {
      console.log(`  DRIFT      ${signed(r.counterDriftBytes)} bytes (${mib(Math.abs(r.counterDriftBytes))})`);
    }
    if (r.orphanCount > 0) {
      console.log(`  ORPHANS    ${r.orphanCount} objects, ${mib(r.orphanBytes)} reclaimable`);
      for (const path of r.orphanPaths.slice(0, 10)) console.log(`               ${path}`);
      if (r.orphanPaths.length > 10) {
        console.log(`               … and ${r.orphanPaths.length - 10} more`);
      }
    }
    console.log('');
  }

  const totalOrphanBytes = interesting.reduce((sum, r) => sum + r.orphanBytes, 0);
  console.log(`Total reclaimable if orphans were deleted: ${mib(totalOrphanBytes)}`);
  console.log('This script does not delete anything. That is a separate decision.\n');

  if (result.applied) {
    console.log(`Counters updated: ${result.countersUpdated}`);
  } else if (interesting.some((r) => r.counterDriftBytes !== 0)) {
    console.log('Re-run with --apply-counter to correct the counters (no deletion).');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyCounter = args.includes('--apply-counter');
  const maxAgeArg = args.find((a) => a.startsWith('--max-age-hours='));
  const capArg = args.find((a) => a.startsWith('--safety-cap='));

  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  try {
    const result = await reconcileSiteAssetsUsage({
      applyCounter,
      ...(maxAgeArg ? { maxAgeHours: Number(maxAgeArg.split('=')[1]) } : {}),
      ...(capArg ? { safetyCap: Number(capArg.split('=')[1]) } : {}),
      log: (m) => console.log(m),
    });

    printReport(result);
  } finally {
    // Without this the postgres pool holds the event loop open and the script
    // never exits — it just sits there looking like a slow query.
    await closeUnscopedClient();
  }
}

// Only run when invoked as a script, so the exported helpers stay importable
// from tests without executing main().
const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].includes('reconcile-site-assets-usage');
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
