/**
 * Every photo already placed somewhere on this community's site — the
 * candidate list behind "Choose from your photos".
 *
 * Derived from blocks React Query already holds. Feed it the WHOLE-SITE list
 * from `useContentBlocks(communityId)`: the editor context's `blocks` is
 * narrowed to the selected page by `EditorRoot`, and "photos on your site"
 * means the site. No endpoint, no storage listing, no pagination, and no new
 * tenancy surface — every path here was validated by
 * `assertPathsScopedToCommunity` when it was written, and the write that
 * reuses it goes through that same check again.
 *
 * Path extraction is `collectBlockAssetPaths`, the same function the write
 * path uses, so the picker cannot offer a path the write path would not
 * recognise, and a new path-bearing block type reaches both at once.
 *
 * ## What is and is not offered
 *
 *  - The hero's imagery IS offered (`photos[].path` and the legacy
 *    `heroImagePath`). The hero row sits at order 1 in the same list, and
 *    `imagePathSchema` accepts the `hero` kind on image and gallery blocks —
 *    reusing the hero's pool photo in a gallery is the spec's motivating case.
 *  - Hidden and draft sections count: the photo is still stored and referenced.
 *  - A photo uploaded and then removed from every section is NOT offered. That
 *    is the orphan case the spec accepts in exchange for not listing storage;
 *    a section staged for deletion (tombstoned) is the same case a publish
 *    early, since the merged list shows the tombstone and not the row it
 *    replaces.
 *
 * `useCount` counts SECTIONS, not placements: the label built from it reads
 * "In N sections", and a gallery repeating one photo is one section.
 */
import { collectBlockAssetPaths } from '@/lib/site-assets/scoped-paths';

export interface PlacedPhoto {
  path: string;
  /**
   * The name the PM uploaded it under — the final path segment with the uuid
   * `buildSiteAssetPath` prefixed stripped off. The only human-meaningful
   * thing a path carries, so it is what distinguishes one thumbnail's
   * accessible name from the next.
   */
  name: string;
  /** How many sections currently reference it. */
  useCount: number;
}

/** `{uuid}-` as `buildSiteAssetPath` writes it. Absent on paths from other writers. */
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

function uploadName(path: string): string {
  const segment = path.slice(path.lastIndexOf('/') + 1);
  return segment.replace(UUID_PREFIX, '');
}

export function placedPhotos(
  blocks: readonly { blockType: string; content: unknown }[],
): PlacedPhoto[] {
  const sectionCounts = new Map<string, number>();
  for (const block of blocks) {
    // Dedupe within the block first so a repeated photo is one section.
    const paths = new Set(
      collectBlockAssetPaths(block.blockType, block.content).map(({ value }) => value),
    );
    for (const path of paths) {
      sectionCounts.set(path, (sectionCounts.get(path) ?? 0) + 1);
    }
  }
  return [...sectionCounts.entries()].map(([path, useCount]) => ({
    path,
    name: uploadName(path),
    useCount,
  }));
}
