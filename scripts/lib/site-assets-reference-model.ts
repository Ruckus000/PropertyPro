/**
 * Which stored objects a community's rows still point at.
 *
 * Split out of `scripts/reconcile-site-assets-usage.ts` and deliberately
 * dependency-free: that script imports `@propertypro/db/unsafe`, which builds
 * a Postgres client at module scope and throws without `DATABASE_URL`. CI's
 * unit job runs with no database, so a test importing the script directly
 * passes locally and fails only in CI. Keeping the pure model here means its
 * tests are genuinely DB-free rather than DB-free-by-mocking.
 *
 * This is the piece that has to be COMPLETE. Every asset shape it fails to
 * recognise becomes a reported orphan, and the orphan list is the input to a
 * future decision about deleting bytes from production. A gap here does not
 * merely degrade the report — it argues for deleting a live asset.
 */

/**
 * Variant suffixes `site/images/finalize` writes for every block image.
 *
 * The route deletes the raw upload at the base path after writing these, so
 * the base path is never itself an object in the bucket.
 */
export const VARIANT_SUFFIXES = ['.1600w.webp', '.800w.webp'] as const;

/**
 * Every storage path a block's content references, as BASE paths.
 *
 * Switches on `blockType` with an explicit `default` rather than duck-typing
 * anything path-shaped, so a new path-bearing block type is a visible omission.
 * Tolerates malformed content: this walks production rows, and a row that
 * fails its schema must contribute no references rather than crash a
 * maintenance script.
 */
export function referencedBasePaths(blockType: string, content: unknown): string[] {
  if (content === null || typeof content !== 'object') return [];
  const record = content as Record<string, unknown>;
  const paths: string[] = [];

  const pushString = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) paths.push(value);
  };

  switch (blockType) {
    case 'image':
      pushString(record['imagePath']);
      break;
    case 'gallery': {
      const images = record['images'];
      if (Array.isArray(images)) {
        for (const image of images) {
          if (image !== null && typeof image === 'object') {
            pushString((image as Record<string, unknown>)['imagePath']);
          }
        }
      }
      break;
    }
    case 'hero': {
      // Both shapes: `photos[]` and the legacy single `heroImagePath`, which
      // heroBlockSchema deliberately retains for rows written before photos[]
      // existed. Missing it would orphan every un-migrated community's hero.
      pushString(record['heroImagePath']);
      const photos = record['photos'];
      if (Array.isArray(photos)) {
        for (const photo of photos) {
          if (photo !== null && typeof photo === 'object') {
            pushString((photo as Record<string, unknown>)['path']);
          }
        }
      }
      break;
    }
    default:
      break;
  }

  return paths;
}

/** Expand base paths to the concrete objects `finalize` actually wrote. */
export function expandToStoredObjects(basePaths: readonly string[]): Set<string> {
  const stored = new Set<string>();
  for (const base of basePaths) {
    for (const suffix of VARIANT_SUFFIXES) stored.add(`${base}${suffix}`);
  }
  return stored;
}

/**
 * Base paths referenced by a retained publish snapshot.
 *
 * `site_publish_snapshots.snapshot` stores the full block payload of a past
 * publish, and `revertToSnapshot` writes that content straight back into
 * `site_blocks` as drafts. So an asset that no live row references can still
 * be one click away from being live again.
 *
 * Without this, a gallery removed from the site last month has no draft row
 * and no published row, but its objects are still restorable — and the
 * reconciler would list them as orphans. Anything acting on that list would
 * delete assets that a one-click revert then renders as broken images on a
 * §718.111(12)(g) transparency page, with no error anywhere.
 *
 * The column is nullable: retention prunes old snapshots, and revert is only
 * offered where `snapshot IS NOT NULL`. A pruned snapshot references nothing,
 * which is correct — those assets really are unreachable.
 */
export function referencedSnapshotPaths(snapshot: unknown): string[] {
  if (snapshot === null || typeof snapshot !== 'object') return [];
  const blocks = (snapshot as Record<string, unknown>)['blocks'];
  if (!Array.isArray(blocks)) return [];

  const paths: string[] = [];
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    const record = block as Record<string, unknown>;
    const blockType = record['blockType'];
    if (typeof blockType !== 'string') continue;
    paths.push(...referencedBasePaths(blockType, record['content']));
  }
  return paths;
}

/**
 * Favicon object paths from a community's branding jsonb.
 *
 * Stored already-processed by `site/images/finalize-favicon`, so they are used
 * verbatim rather than variant-expanded.
 *
 * `logoPath` / `siteLogoPath` are deliberately excluded: those live in the
 * `documents` bucket via the branding upload flow, not in
 * `community-site-assets`.
 */
export function referencedBrandingPaths(branding: unknown): string[] {
  if (branding === null || typeof branding !== 'object') return [];
  const favicon = (branding as Record<string, unknown>)['favicon'];
  if (favicon === null || favicon === undefined || typeof favicon !== 'object') return [];
  const record = favicon as Record<string, unknown>;
  return [record['icon32Path'], record['appleTouch180Path']].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}
