'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReorderBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import {
  useCanvasSelection,
  type CanvasSelection,
} from './canvas/use-canvas-selection';
import { sectionLabel } from './section-label';

export type MoveDirection = 'up' | 'down';

export interface SiteEditorContextValue {
  /**
   * Merged draft-wins blocks for the SELECTED PAGE, exactly as the canvas
   * renders them (D-C2).
   *
   * Narrowed by `blocksForPage` in `EditorRoot` before it reaches here. The
   * narrowing is load-bearing, not cosmetic: `movableSections` below feeds
   * `SectionList` — the editor's DEFAULT tool — and the Inspector, both of
   * which sit beside the canvas and are read as one view with it. An unscoped
   * list makes them offer sections the canvas is not showing, and selecting one
   * opens the Inspector on a block whose write `assertSlotFreeAcrossPages`
   * rejects, because the write hooks carry the selected page's id (D-WRITE).
   *
   * The whole-site list still exists for the callers that need it — the publish
   * diff and the slot allocator (D-C3) — which read `useContentBlocks`
   * directly rather than going through this context.
   */
  blocks: readonly SiteBlockSummary[];
  /** Reorderable sections, slot-ordered, hero and tombstones excluded. */
  movableSections: SiteBlockSummary[];

  selection: CanvasSelection | null;
  isSelected: (blockId: number) => boolean;
  select: (blockId: number) => void;
  /**
   * Select by slot, for a section that may not exist in `blocks` yet — how the
   * Add panel opens the inspector on what it just created.
   *
   * Unlike `select`, this deliberately does NOT fire `onSelect`. `onSelect`
   * switches the shell to the Sections tab, which would unmount the Add panel
   * the moment a section is added — breaking "add three sections in a row" and
   * gaining nothing, since the inspector is its own column and opens whatever
   * tab is active.
   */
  selectSlot: (blockOrder: number, blockType: string) => void;
  clear: () => void;

  canMove: (blockId: number, direction: MoveDirection) => boolean;
  /** Move one position. No-op (not an error) at the ends. */
  move: (blockId: number, direction: MoveDirection) => void;
  /** Move to an absolute slot — the drag-and-drop drop target. */
  moveTo: (blockId: number, toOrder: number) => void;
  isMoving: boolean;
}

const SiteEditorContext = createContext<SiteEditorContextValue | null>(null);

export interface SiteEditorProviderProps {
  communityId: number;
  blocks: readonly SiteBlockSummary[];
  /** Fired when a section is selected, so the shell can reveal its panel. */
  onSelect?: (blockId: number) => void;
  /**
   * A `block_order` to select as soon as this provider mounts (Phase 11b-3).
   *
   * This exists for exactly one caller: the publish sheet's "Fix this" on an
   * issue that belongs to a section on ANOTHER page. `EditorRoot` switches page,
   * which changes `key={effectivePageId}` and therefore REMOUNTS this provider —
   * so any selection made in the same tick is thrown away with the old instance,
   * and a selection made against the pre-switch `movableSections` never resolves
   * in the first place. Handing the intent down as a prop and letting the NEW
   * instance act on it is the only ordering that works: on mount, `blocks` is
   * already the target page's.
   *
   * Same-page "Fix this" does not come through here — nothing remounts, so
   * `PublishSheetMount` selects directly.
   */
  children: React.ReactNode;
}

/**
 * The cross-page "Fix this" hand-off — an all-or-nothing PAIR, enforced by the
 * type, for the same reason `EditorShell`'s `ControlledToolProps` is.
 *
 * Supply `selectSlotOnMount` without `onSlotSelected` and the consuming effect
 * selects the slot and then calls `onSlotSelectedRef.current?.()` — a silent
 * no-op — so the owner's `pendingSelectSlot` is never cleared. `consumedSlotRef`
 * only suppresses re-consumption on THIS instance, and `EditorRoot` keys this
 * provider on the selected page, so the next page switch remounts it with the
 * stale slot still armed and yanks the PM's selection to a section they left
 * behind. Round 6 recorded that the clearing is load-bearing; nothing enforced
 * it.
 *
 * Omitting BOTH is legitimate (most callers, and every canvas test), so this is
 * a union rather than two required props.
 */
type SlotHandoffProps =
  | { selectSlotOnMount: number | null; onSlotSelected: () => void }
  | { selectSlotOnMount?: never; onSlotSelected?: never };

export type SiteEditorProviderPropsWithSlot = SiteEditorProviderProps & SlotHandoffProps;

/**
 * Shared editing state for the v3 editor: which section is selected, and how
 * sections move.
 *
 * This is a context rather than a hook because the two surfaces that drive it
 * live in different columns — the canvas (`SectionShell` / `FloatControls`) and
 * the Sections tool panel (`SectionList`). Two independent hook instances would
 * mean two selections that silently disagree, and two screen-reader live
 * regions announcing the same move twice.
 *
 * The provider renders the single live region. Both surfaces mutate through
 * `move` / `moveTo`, so a reorder is announced exactly once no matter which one
 * initiated it.
 */
export function SiteEditorProvider({
  communityId,
  blocks,
  onSelect,
  selectSlotOnMount,
  onSlotSelected,
  children,
}: SiteEditorProviderPropsWithSlot) {
  const {
    selection,
    isSelected,
    select: selectInternal,
    selectSlot,
    clear,
    movableSections,
  } = useCanvasSelection(blocks);
  const reorder = useReorderBlocks(communityId);
  const [announcement, setAnnouncement] = useState('');

  const select = useCallback(
    (blockId: number) => {
      selectInternal(blockId);
      onSelect?.(blockId);
    },
    [onSelect, selectInternal],
  );

  /*
   * Consume `selectSlotOnMount` — see the prop's doc for why it cannot be done
   * by the caller.
   *
   * `selectInternal`, not `select`: `onSelect` reveals the Sections panel, and
   * `EditorRoot` has already done that synchronously before switching page.
   * Calling it again would be a second identical `setActiveTool`.
   *
   * Not a bare mount effect. `movableSections` is derived from `blocks`, which
   * is already populated at mount on the real path (the block list is
   * whole-site and cached, and `EditorRoot` narrows it synchronously) — but if
   * the query is still in flight the list is empty and there is nothing to
   * find, so the effect re-runs as it fills. `consumedRef` makes that "keep
   * looking until it appears", not "select repeatedly": once a slot has been
   * honoured on this instance, a later refetch cannot yank the PM's selection
   * back to it.
   */
  const consumedSlotRef = useRef(false);
  const onSlotSelectedRef = useRef(onSlotSelected);
  onSlotSelectedRef.current = onSlotSelected;
  useEffect(() => {
    if (selectSlotOnMount === null || selectSlotOnMount === undefined) return;
    if (consumedSlotRef.current) return;
    const target = movableSections.find((b) => b.blockOrder === selectSlotOnMount);
    if (!target) return;
    consumedSlotRef.current = true;
    selectInternal(target.id);
    onSlotSelectedRef.current?.();
  }, [movableSections, selectInternal, selectSlotOnMount]);

  const indexOf = useCallback(
    (blockId: number) => movableSections.findIndex((b) => b.id === blockId),
    [movableSections],
  );

  const canMove = useCallback(
    (blockId: number, direction: MoveDirection) => {
      const index = indexOf(blockId);
      if (index === -1) return false;
      return direction === 'up' ? index > 0 : index < movableSections.length - 1;
    },
    [indexOf, movableSections.length],
  );

  const announceMove = useCallback(
    (block: SiteBlockSummary, position: number) => {
      setAnnouncement(
        `${sectionLabel(block.blockType)} moved to position ${position} of ${movableSections.length}.`,
      );
    },
    [movableSections.length],
  );

  const move = useCallback(
    (blockId: number, direction: MoveDirection) => {
      // Moving the first section up or the last one down is a no-op rather than
      // an error — the control is reachable by keyboard, and a PM holding
      // Alt+Up should hit a soft stop, not a toast.
      if (!canMove(blockId, direction)) return;
      const index = indexOf(blockId);
      const block = movableSections[index]!;
      announceMove(block, direction === 'up' ? index : index + 2);
      reorder.mutate({ blockId, direction });
    },
    [announceMove, canMove, indexOf, movableSections, reorder],
  );

  const moveTo = useCallback(
    (blockId: number, toOrder: number) => {
      const index = indexOf(blockId);
      const targetIndex = movableSections.findIndex((b) => b.blockOrder === toOrder);
      if (index === -1 || targetIndex === -1 || targetIndex === index) return;
      announceMove(movableSections[index]!, targetIndex + 1);
      reorder.mutate({ blockId, toOrder });
    },
    [announceMove, indexOf, movableSections, reorder],
  );

  const value = useMemo<SiteEditorContextValue>(
    () => ({
      blocks,
      movableSections,
      selection,
      isSelected,
      select,
      selectSlot,
      clear,
      canMove,
      move,
      moveTo,
      isMoving: reorder.isPending,
    }),
    [
      blocks,
      movableSections,
      selection,
      isSelected,
      select,
      selectSlot,
      clear,
      canMove,
      move,
      moveTo,
      reorder.isPending,
    ],
  );

  return (
    <SiteEditorContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </SiteEditorContext.Provider>
  );
}

export function useSiteEditor(): SiteEditorContextValue {
  const value = useContext(SiteEditorContext);
  if (!value) {
    throw new Error('useSiteEditor must be used inside a SiteEditorProvider');
  }
  return value;
}
