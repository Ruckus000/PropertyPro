/**
 * The hero owns slot 1; content sections run 2..99 (the contract's bounds).
 *
 * These bounds are PER PAGE as of Phase 11c (migration 0048), which dropped
 * `site_blocks_community_order_draft_partial (community_id, block_order,
 * is_draft)`. Each page now gets its own 98 content positions, and two pages
 * holding slot 2 is an ordinary state rather than a constraint violation.
 *
 * This comment used to say the opposite, and said it as load-bearing rationale.
 * It is inverted rather than deleted so the next reader does not re-derive the
 * community-wide rule from the surrounding code and "fix" the allocator back.
 */
export const FIRST_CONTENT_SLOT = 2;
export const LAST_CONTENT_SLOT = 99;

/**
 * The slot a new section should take, or null when every slot on the PAGE it
 * was given is taken.
 *
 * **Must be given every block row of ONE page, tombstones included.**
 *
 * Two independent reasons, and confusing them is how this goes wrong:
 *
 *  1. *Tombstones.* A tombstone is a staged deletion that still occupies its
 *     slot; `upsertPublishedBlock` soft-deletes whatever draft sits at the
 *     target order, so writing over one silently cancels the removal and
 *     republishes a section the PM took off the site. That is why this takes raw
 *     `useContentBlocks` output and not `movableSections`, which filters
 *     tombstones out.
 *
 *  2. *One page* — and this reason is the INVERSE of what it was through 11b.
 *     Until migration 0048, `block_order` was unique community-wide
 *     (`site_blocks_community_order_draft_partial`), so narrowing to the
 *     selected page computed `max(this page) + 1`, very likely a slot another
 *     page already held, and the write failed the unique index. 0048 DROPPED
 *     that index; uniqueness is now `(community_id, page_id, block_order,
 *     is_draft)` and two pages may legally hold the same slot. Spanning every
 *     page is therefore wrong in the opposite direction — it skips past other
 *     pages' numbers and runs this page into the 99 ceiling long before it has
 *     used its own 98 positions. Callers narrow with `blocksForPage` first
 *     (`AddPanel`, and `duplicate` in `editor-context`). The function itself
 *     never changed; what changed is the list it is given.
 *
 *     Do NOT "fix" a cross-page slot collision by widening this input back to
 *     every page — post-0048 there is no such collision to fix.
 *     `add-catalog.test.ts` and `AddPanel.test.tsx` each pin the inversion with
 *     a named case.
 *
 * Appends at `max + 1` rather than filling the first gap: reorders re-stamp the
 * existing sparse slot sequence, so gaps persist indefinitely, and filling one
 * would drop the new section into the middle of the page with no explanation.
 * Gap-filling is the fallback only at the 99 ceiling, where the alternative is
 * refusing to add at all.
 */
export function nextContentSlot(blocks: readonly { blockOrder: number }[]): number | null {
  const occupied = new Set(blocks.map((b) => b.blockOrder));
  const highest = occupied.size === 0 ? 1 : Math.max(...occupied);
  const appended = highest + 1;
  if (appended <= LAST_CONTENT_SLOT) return Math.max(appended, FIRST_CONTENT_SLOT);

  for (let slot = FIRST_CONTENT_SLOT; slot <= LAST_CONTENT_SLOT; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
