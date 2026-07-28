'use client';

import { useCallback, useMemo, useState } from 'react';
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

/** The hero is pinned to slot 1 and is neither reorderable nor removable. */
export const HERO_BLOCK_ORDER = 1;

export interface CanvasSelection {
  blockId: number;
  blockOrder: number;
  blockType: string;
  /** False for the hero, which cannot be reordered or removed. */
  isMovable: boolean;
}

export interface UseCanvasSelectionResult {
  selection: CanvasSelection | null;
  isSelected: (blockId: number) => boolean;
  select: (blockId: number) => void;
  /**
   * Select by SLOT, for a section that may not exist in `blocks` yet.
   *
   * `select` cannot do this job. It resolves the id against `blocks`, so it is
   * memoized on `blocks` — and the Add panel's caller runs in the microtask
   * after `await mutateAsync(...)`, holding the closure from the render BEFORE
   * the new row arrived. It would find nothing and clear the anchor, and the
   * inspector would silently not open.
   *
   * This sets the anchor directly from values the caller already has (it chose
   * the slot and the type), so it closes over nothing and cannot go stale.
   * Resolution step 2 then does the rest once the refetch lands.
   */
  selectSlot: (blockOrder: number, blockType: string) => void;
  clear: () => void;
  /** Sections the PM can reorder: hero and tombstones excluded, slot-ordered. */
  movableSections: SiteBlockSummary[];
}

/**
 * What we remember about the selected section between renders.
 *
 * Not just the id: see the resolution order documented on the hook.
 *
 * `id` is null for an anchor set by `selectSlot`, where the row does not exist
 * yet and therefore has no id. Ids are numbers, so a null id simply never
 * matches resolution step 1 and falls through to the `(order, blockType)`
 * branch; the re-anchor below rewrites it with the real id on arrival.
 */
interface SelectionAnchor {
  id: number | null;
  order: number;
  blockType: string;
}

/**
 * Canvas selection state for the v3 editor.
 *
 * Selection is stored as an **anchor** — `{ id, order, blockType }` — and
 * re-resolved against the current block list on every render. Both parts matter,
 * because every mutation in this editor soft-deletes the selected row and
 * INSERTs a fresh one:
 *
 *   - a **save** changes `id` and keeps `order`;
 *   - a **reorder** changes `order`, and (after the refetch) `id` as well.
 *
 * So neither key survives every mutation on its own. Resolution is therefore:
 *
 *   1. by `id` — the common case, and the only one that is unambiguous;
 *   2. failing that, by `order`, **guarded on `blockType`** — this is what
 *      carries the selection across a save;
 *   3. failing both, no selection.
 *
 * The anchor re-anchors itself whenever resolution succeeds and the block has
 * moved. That is what makes a reorder work without any cooperation from
 * `move`/`moveTo`: `useReorderBlocks` updates the cache optimistically by
 * re-stamping `blockOrder` while PRESERVING ids, so there is always a window in
 * which step 1 succeeds and the anchor picks up the new slot before the refetch
 * arrives with fresh ids.
 *
 * The `blockType` guard on step 2 is deliberate. Without it, a section that
 * disappeared while a different section slid into its slot (a cross-tab
 * reorder, a discard) would silently transfer the selection, and the inspector
 * would edit a section the PM never chose. Clearing is the safe failure.
 *
 * A failed resolution does NOT clear the anchor. A refetch can briefly hand the
 * canvas an empty list, and treating that as a deletion would close the panel
 * under the PM for a frame; keeping the anchor lets the selection come back.
 * Genuine removal still reports no selection, every render, which is what every
 * consumer branches on.
 *
 * Tombstone rows are staged deletions and are never selectable — they render as
 * nothing on the canvas, so selecting one would highlight empty space.
 */
export function useCanvasSelection(
  blocks: readonly SiteBlockSummary[],
): UseCanvasSelectionResult {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);

  const selection = useMemo<CanvasSelection | null>(() => {
    if (anchor === null) return null;
    const byId = blocks.find((b) => b.id === anchor.id);
    const found =
      byId ??
      blocks.find((b) => b.blockOrder === anchor.order && b.blockType === anchor.blockType);
    if (!found || found.blockType === TOMBSTONE_BLOCK_TYPE) return null;
    return {
      blockId: found.id,
      blockOrder: found.blockOrder,
      blockType: found.blockType,
      isMovable: found.blockType !== 'hero' && found.blockOrder !== HERO_BLOCK_ORDER,
    };
  }, [blocks, anchor]);

  // Keep the anchor in step with where the section actually is now.
  //
  // Adjusting state during render rather than in an effect: an effect runs
  // after paint, which leaves a window where the next `blocks` update could
  // arrive against a stale anchor and resolve to the wrong section. React
  // re-runs this component immediately with the new state, and the resolution
  // above is idempotent once the anchor matches, so this settles in one extra
  // pass and cannot loop.
  if (
    anchor !== null &&
    selection !== null &&
    (selection.blockId !== anchor.id || selection.blockOrder !== anchor.order)
  ) {
    setAnchor({
      id: selection.blockId,
      order: selection.blockOrder,
      blockType: selection.blockType,
    });
  }

  const movableSections = useMemo(
    () =>
      blocks
        .filter(
          (b) =>
            b.blockType !== 'hero' &&
            b.blockOrder !== HERO_BLOCK_ORDER &&
            b.blockType !== TOMBSTONE_BLOCK_TYPE,
        )
        .sort((a, b) => a.blockOrder - b.blockOrder),
    [blocks],
  );

  const isSelected = useCallback(
    (blockId: number) => selection?.blockId === blockId,
    [selection],
  );

  // `select` takes a bare id — every caller has one and none of them has the
  // slot to hand — so the anchor's other two fields are looked up here. An id
  // that matches nothing selects nothing, same as before.
  const select = useCallback(
    (blockId: number) => {
      const found = blocks.find((b) => b.id === blockId);
      setAnchor(
        found
          ? { id: found.id, order: found.blockOrder, blockType: found.blockType }
          : null,
      );
    },
    [blocks],
  );

  // Empty dep array, and that is the whole point — see the interface docblock.
  // A `blocks` dependency here would reintroduce exactly the stale-closure bug
  // this exists to avoid.
  const selectSlot = useCallback(
    (blockOrder: number, blockType: string) =>
      setAnchor({ id: null, order: blockOrder, blockType }),
    [],
  );

  const clear = useCallback(() => setAnchor(null), []);

  return { selection, isSelected, select, selectSlot, clear, movableSections };
}
