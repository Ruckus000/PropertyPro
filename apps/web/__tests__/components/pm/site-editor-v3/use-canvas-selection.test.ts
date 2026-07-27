/**
 * Canvas selection — the resolve-or-clear contract.
 *
 * The behaviour under test is that selection survives a re-render only if the
 * selected row still exists. Every mutation in the site editor soft-deletes the
 * old row and inserts a fresh one, so a block's `id` changes whenever it is
 * edited or moved; holding a resolved object (or an id without re-resolving)
 * would leave the editor pointing at a row that is gone.
 */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import { useCanvasSelection } from '@/components/pm/site-editor-v3/canvas/use-canvas-selection';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

function block(overrides: Partial<SiteBlockSummary> & { id: number }): SiteBlockSummary {
  return {
    blockType: 'text',
    blockOrder: overrides.id,
    content: {},
    isDraft: false,
    publishedAt: null,
    ...overrides,
  };
}

const HERO = block({ id: 1, blockType: 'hero', blockOrder: 1 });
const TEXT = block({ id: 2, blockType: 'text', blockOrder: 2 });
const IMAGE = block({ id: 3, blockType: 'image', blockOrder: 3 });

describe('useCanvasSelection', () => {
  it('selects and clears', () => {
    const { result } = renderHook(() => useCanvasSelection([HERO, TEXT, IMAGE]));

    expect(result.current.selection).toBeNull();

    act(() => result.current.select(2));
    expect(result.current.selection).toEqual({
      blockId: 2,
      blockOrder: 2,
      blockType: 'text',
      isMovable: true,
    });
    expect(result.current.isSelected(2)).toBe(true);
    expect(result.current.isSelected(3)).toBe(false);

    act(() => result.current.clear());
    expect(result.current.selection).toBeNull();
  });

  it('marks the hero selectable but not movable', () => {
    const { result } = renderHook(() => useCanvasSelection([HERO, TEXT]));

    act(() => result.current.select(1));
    expect(result.current.selection?.isMovable).toBe(false);
  });

  it('clears the selection when the selected block disappears', () => {
    // The removal case: a section is deleted, so its row is gone from the next
    // render's list. Selection must not dangle.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(3));
    expect(result.current.selection?.blockId).toBe(3);

    rerender({ blocks: [HERO, TEXT] });
    expect(result.current.selection).toBeNull();
  });

  it('clears the selection when the selected block becomes a tombstone', () => {
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(2));
    expect(result.current.selection?.blockId).toBe(2);

    rerender({
      blocks: [HERO, block({ id: 2, blockType: TOMBSTONE_BLOCK_TYPE, blockOrder: 2 })],
    });
    expect(result.current.selection).toBeNull();
  });

  it('reports the CURRENT blockOrder after a reorder replaces the row', () => {
    // A reorder inserts fresh draft rows, so the same logical section comes
    // back with a new id at a new order. Selecting by id and re-resolving is
    // what keeps `blockOrder` honest — a cached selection object would report
    // the pre-move slot and the float controls would act on the wrong one.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(3));
    expect(result.current.selection?.blockOrder).toBe(3);

    rerender({
      blocks: [HERO, block({ id: 3, blockType: 'image', blockOrder: 2 }), block({ id: 2, blockOrder: 3 })],
    });
    expect(result.current.selection).toEqual({
      blockId: 3,
      blockOrder: 2,
      blockType: 'image',
      isMovable: true,
    });
  });

  it('keeps the selection when a save replaces the row with a new id at the same slot', () => {
    // The bug this fixes. Every write soft-deletes the selected row and INSERTs
    // a fresh one, so `id` changes but `blockOrder` does not. Resolving by id
    // alone cleared the selection on the FIRST autosave — the inspector
    // unmounted and the panel closed while the PM was still typing.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(2));
    expect(result.current.selection?.blockId).toBe(2);

    // The save lands: same section, same slot, brand-new row id.
    rerender({
      blocks: [HERO, block({ id: 99, blockType: 'text', blockOrder: 2 }), IMAGE],
    });

    expect(result.current.selection).toEqual({
      blockId: 99,
      blockOrder: 2,
      blockType: 'text',
      isMovable: true,
    });
    // And the re-stamped id is what selection-dependent chrome keys off.
    expect(result.current.isSelected(99)).toBe(true);
    expect(result.current.isSelected(2)).toBe(false);
  });

  it('follows the section through a reorder that changes both id and slot', () => {
    // A reorder changes the slot AND (after the refetch) the id, so neither
    // key survives on its own. `useReorderBlocks` updates the cache
    // optimistically by re-stamping blockOrder while PRESERVING ids, which is
    // the window in which the anchor re-anchors to the new slot; the refetch
    // that follows then resolves by slot.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(3));
    expect(result.current.selection?.blockOrder).toBe(3);

    // 1. Optimistic rotation: ids preserved, slots swapped.
    rerender({
      blocks: [
        HERO,
        block({ id: 3, blockType: 'image', blockOrder: 2 }),
        block({ id: 2, blockType: 'text', blockOrder: 3 }),
      ],
    });
    expect(result.current.selection?.blockOrder).toBe(2);

    // 2. Settle: the server returns the same order with fresh row ids.
    rerender({
      blocks: [
        HERO,
        block({ id: 31, blockType: 'image', blockOrder: 2 }),
        block({ id: 21, blockType: 'text', blockOrder: 3 }),
      ],
    });
    expect(result.current.selection).toEqual({
      blockId: 31,
      blockOrder: 2,
      blockType: 'image',
      isMovable: true,
    });
  });

  it('does not resurrect the selection onto a different section that took the slot', () => {
    // The slot fallback is deliberately type-guarded. Without it, a section
    // that vanished while a DIFFERENT type slid into its slot (a cross-tab
    // reorder, a discard) would silently transfer the selection — and the
    // inspector would edit a section the PM never chose. Clearing is the safe
    // failure here.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(3));

    rerender({
      blocks: [HERO, TEXT, block({ id: 77, blockType: 'faq', blockOrder: 3 })],
    });
    expect(result.current.selection).toBeNull();
  });

  it('does not fall back onto a tombstone occupying the slot', () => {
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(2));

    // Staged deletion: new row id, same slot, tombstone type.
    rerender({
      blocks: [HERO, block({ id: 88, blockType: TOMBSTONE_BLOCK_TYPE, blockOrder: 2 })],
    });
    expect(result.current.selection).toBeNull();
  });

  it('recovers the selection after a transient empty list', () => {
    // A refetch can briefly hand the canvas an empty list. That must not be
    // treated as a deletion — the anchor is kept so the selection comes back
    // rather than the panel closing under the PM for a frame.
    const { result, rerender } = renderHook(
      ({ blocks }) => useCanvasSelection(blocks),
      { initialProps: { blocks: [HERO, TEXT, IMAGE] as SiteBlockSummary[] } },
    );

    act(() => result.current.select(2));
    rerender({ blocks: [] });
    expect(result.current.selection).toBeNull();

    rerender({ blocks: [HERO, TEXT, IMAGE] });
    expect(result.current.selection?.blockId).toBe(2);
  });

  it('excludes the hero and tombstones from movableSections, slot-ordered', () => {
    const { result } = renderHook(() =>
      useCanvasSelection([
        IMAGE,
        HERO,
        TEXT,
        block({ id: 4, blockType: TOMBSTONE_BLOCK_TYPE, blockOrder: 4 }),
      ]),
    );

    expect(result.current.movableSections.map((b) => b.id)).toEqual([2, 3]);
  });
});
