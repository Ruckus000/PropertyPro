/**
 * `SiteBlockSummary[]` → `SiteSnapshot`, the shape the Phase 4 change model
 * consumes.
 *
 * This is the seam where an off-by-one quietly corrupts every diff downstream,
 * so it is a pure function with its own test file rather than an inline `.map`
 * inside the publish sheet.
 *
 * Three decisions worth stating, because the obvious implementations of each
 * are wrong:
 *
 * 1. **The hero is slot 1 AND type `hero`, not merely slot 1.** A `hero`-typed
 *    row that has drifted to slot 4, or a `text` row that has drifted to slot
 *    1, is a real broken state that `siteIssues` has explicit errors for
 *    ("The hero block must be at blockOrder 1" / "Non-hero blocks must be at
 *    blockOrder 2 or higher"). Those errors only fire for rows in `sections`.
 *    Hoisting any slot-1 row into `hero` would hide the one case the
 *    validation exists to catch, and publish the broken page.
 *
 * 2. **Out-of-range slots are kept, not filtered.** Slots outside 1..99 are
 *    likewise an error `siteIssues` reports. Dropping them here would make an
 *    invalid row invisible to validation while it still sits in the database
 *    waiting to be promoted.
 *
 * 3. **Tombstones become `tombstonedSlots`, never sections.** The merged
 *    draft-wins list replaces the published row with the tombstone draft, so a
 *    tombstone in `sections` would read to `diffSite` as an *added* section of
 *    an unknown type instead of a *removed* one — exactly backwards.
 */
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import type { SiteSectionSnapshot, SiteSnapshot } from '@propertypro/shared';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

/** `site_blocks.block_order` reserved for the hero. Content blocks are 2..99. */
export const HERO_SLOT = 1;

export interface ToSnapshotOptions {
  /** Forward-compat for Phase 11 multi-page. Omitted today, so `diffSite` groups under `'site'`. */
  pageId?: string;
  /** `communities.branding`, unparsed. Unstaged today, so normally omitted. */
  branding?: unknown;
}

function toSection(block: SiteBlockSummary): SiteSectionSnapshot {
  return {
    slot: block.blockOrder,
    blockType: block.blockType,
    content: block.content,
  };
}

/**
 * Maps a merged (draft-wins) or published-only block list to a `SiteSnapshot`.
 *
 * Sections come out slot-ascending. `diffSite` sorts for itself, but a stable
 * order makes the `sections.<i>` field paths that `siteIssues` emits index the
 * same section every render — which is what `issueTarget` below relies on to
 * turn an issue back into a slot the editor can select.
 */
export function toSnapshot(
  blocks: readonly SiteBlockSummary[] | undefined | null,
  options: ToSnapshotOptions = {},
): SiteSnapshot {
  const rows = [...(blocks ?? [])].sort((a, b) => a.blockOrder - b.blockOrder);

  const tombstonedSlots: number[] = [];
  let hero: SiteSectionSnapshot | null = null;
  const sections: SiteSectionSnapshot[] = [];

  for (const row of rows) {
    if (row.blockType === TOMBSTONE_BLOCK_TYPE) {
      tombstonedSlots.push(row.blockOrder);
      continue;
    }
    // First one wins: a duplicated slot 1 is a data bug, and the surviving
    // duplicate lands in `sections`, where `siteIssues` reports it as such.
    if (hero === null && row.blockOrder === HERO_SLOT && row.blockType === 'hero') {
      hero = toSection(row);
      continue;
    }
    sections.push(toSection(row));
  }

  return {
    ...(options.pageId !== undefined ? { pageId: options.pageId } : {}),
    hero,
    sections,
    ...(tombstonedSlots.length > 0 ? { tombstonedSlots } : {}),
    ...(options.branding !== undefined ? { branding: options.branding } : {}),
  };
}

export interface IssueTarget {
  slot: number;
  blockType: string;
}

/**
 * Resolves an `Issue.field` path back to the section it is about, so the
 * review sheet can offer "Fix this" rather than a generic "something is wrong".
 *
 * `siteIssues` emits `hero…` and `sections.<index>…` paths, where the index is
 * a position in `snapshot.sections` — NOT a slot. Treating the two as
 * interchangeable sends the PM to the wrong section, which is worse than not
 * offering the jump at all.
 *
 * Returns `null` for issues that are not about a section (contrast issues name
 * `primaryColor` / `accentColor`).
 */
export function issueTarget(field: string, snapshot: SiteSnapshot): IssueTarget | null {
  if (field === 'hero' || field.startsWith('hero.')) {
    return snapshot.hero ? { slot: snapshot.hero.slot, blockType: snapshot.hero.blockType } : null;
  }
  const match = /^sections\.(\d+)(?:\.|$)/.exec(field);
  if (!match) return null;
  const section = snapshot.sections[Number(match[1])];
  return section ? { slot: section.slot, blockType: section.blockType } : null;
}
