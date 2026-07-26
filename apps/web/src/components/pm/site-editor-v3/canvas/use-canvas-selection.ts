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
  clear: () => void;
  /** Sections the PM can reorder: hero and tombstones excluded, slot-ordered. */
  movableSections: SiteBlockSummary[];
}

/**
 * Canvas selection state for the v3 editor.
 *
 * Selection is stored as a bare `blockId` and **re-resolved against the current
 * block list on every render**. That indirection is load-bearing rather than
 * incidental: `upsertPublishedBlock` and `reorderSiteBlock` both soft-delete the
 * old row and INSERT a fresh one, so a block's `id` changes every time it is
 * edited or moved. Holding a resolved object in state would leave the editor
 * pointing at a row that no longer exists, and holding the id without
 * re-resolving would report a stale `blockOrder`.
 *
 * Resolve-or-clear also gives two of the phase's edge cases for free, with no
 * effect and no cleanup path: removing the selected section clears the
 * selection instead of dangling, and a section that disappears underneath the
 * PM (a discard, another editor's publish) does the same.
 *
 * Tombstone rows are staged deletions and are never selectable — they render as
 * nothing on the canvas, so selecting one would highlight empty space.
 */
export function useCanvasSelection(
  blocks: readonly SiteBlockSummary[],
): UseCanvasSelectionResult {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selection = useMemo<CanvasSelection | null>(() => {
    if (selectedId === null) return null;
    const found = blocks.find((b) => b.id === selectedId);
    if (!found || found.blockType === TOMBSTONE_BLOCK_TYPE) return null;
    return {
      blockId: found.id,
      blockOrder: found.blockOrder,
      blockType: found.blockType,
      isMovable: found.blockType !== 'hero' && found.blockOrder !== HERO_BLOCK_ORDER,
    };
  }, [blocks, selectedId]);

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

  const select = useCallback((blockId: number) => setSelectedId(blockId), []);
  const clear = useCallback(() => setSelectedId(null), []);

  return { selection, isSelected, select, clear, movableSections };
}
