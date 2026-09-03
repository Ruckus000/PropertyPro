import {
  upsertableBlockType,
  type UpsertableBlockType,
} from './upsertable-block-type';

/** What a duplicated section is written with. Position is decided separately. */
export interface DuplicatePlan {
  blockType: UpsertableBlockType;
  content: Record<string, unknown>;
}

/** The minimum shape planning needs. Widened so tests can use plain rows. */
export interface DuplicateSourceBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

/**
 * What a copy of `blockId` carries — or null when that section must not be
 * copied through the upsert path at all.
 *
 * Deliberately says NOTHING about position. The editor has no "insert" verb:
 * `upsertPublishedBlock` REPLACES whatever draft sits at the order it is given,
 * and `POST /blocks/reorder` is an array-move over the slots that already
 * exist. So a copy is written to the free slot at the end of the page and then
 * moved (see `reorderTargetForCopy`), and there is no shift plan to compute.
 *
 * The copy starts VISIBLE even when the source is hidden. `hidden` is
 * `z.literal(true).optional()` in every block schema, so its ABSENCE is the
 * only encoding of "visible" — dropping the key is how the copy says so.
 * Inheriting it would make Duplicate look like it did nothing: the new section
 * would be off the public site, and the PM's only clue would be a second
 * greyed-out row.
 *
 * The content copy is shallow. That is enough because the result is handed
 * straight to the upsert mutation, which JSON-serialises it — no caller holds
 * the object long enough for a shared nested reference to matter — and because
 * nothing here writes through it.
 */
export function planDuplicate(
  blocks: readonly DuplicateSourceBlock[],
  blockId: number,
): DuplicatePlan | null {
  const source = blocks.find((b) => b.id === blockId);
  if (source === undefined) return null;

  const blockType = upsertableBlockType(source.blockType);
  if (blockType === null) return null;

  const raw =
    typeof source.content === 'object' && source.content !== null
      ? (source.content as Record<string, unknown>)
      : {};
  const { hidden: _hidden, ...content } = raw;

  return { blockType, content };
}

/**
 * The slot the freshly written copy must be dropped on to end up directly below
 * its source — or null when it is already there and no move is needed.
 *
 * `sections` is the page's content sections BEFORE the copy is written, hero
 * and tombstones excluded: the same merged list `reorderSiteBlock` builds, so
 * this agrees with what the server will do.
 *
 * Two rules, both forced by `reorderSiteBlock` rather than chosen:
 *
 *  - **The target must be an OCCUPIED slot.** A reorder rotates the block onto
 *    the position another block currently holds and re-stamps the existing slot
 *    sequence; a `toOrder` no content section occupies is rejected outright
 *    ("That position is no longer a content section"). So the target is the
 *    source's next NEIGHBOUR, never `sourceOrder + 1` — slots stay sparse
 *    forever, because reorders reuse the sequence rather than re-packing it.
 *
 *  - **The direction changes which neighbour to name.** The move removes the
 *    copy from the list before re-inserting it, so every index after it shifts
 *    down by one. Coming from BELOW (the ordinary append) the copy lands in the
 *    named block's place, so name the neighbour below the source. Coming from
 *    ABOVE — only reachable when `nextContentSlot` hits the 99 ceiling and
 *    fills a gap — it lands one place later, so name the SOURCE itself.
 */
export function reorderTargetForCopy(
  sections: readonly { blockOrder: number }[],
  sourceOrder: number,
  copySlot: number,
): number | null {
  if (copySlot < sourceOrder) return sourceOrder;

  // Nothing between the source and the copy means the copy already sits
  // directly below it — the last-section case, and the gap-fill that happened
  // to land in the gap right below the source.
  const displaced = sections.filter(
    (s) => s.blockOrder > sourceOrder && s.blockOrder < copySlot,
  );
  if (displaced.length === 0) return null;

  return displaced.reduce((lowest, s) => (s.blockOrder < lowest ? s.blockOrder : lowest), Infinity);
}
