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
import {
  useReorderBlocks,
  useUpsertContentBlock,
  type SiteBlockSummary,
} from '@/hooks/use-content-blocks';
import {
  planDuplicate,
  reorderTargetForCopy,
} from '@/lib/site-editor/plan-duplicate';
import { upsertableBlockType } from '@/lib/site-editor/upsertable-block-type';
import {
  useCanvasSelection,
  type CanvasSelection,
} from './canvas/use-canvas-selection';
import { nextContentSlot } from './panels/add-catalog';
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
   * The whole-site list still exists for the caller that needs it — the publish
   * diff (D-C2) — which reads `useContentBlocks` directly rather than going
   * through this context.
   *
   * The slot allocator is NOT such a caller any more. Migration 0048 dropped
   * the community-wide unique index, so slots are per page and `nextContentSlot`
   * wants a page-scoped list — this one. `AddPanel` still calls
   * `useContentBlocks` itself, but for a different reason that survives: this
   * context collapses `undefined` to `[]`, which makes "still loading"
   * indistinguishable from "empty page", and the next slot for an empty page is
   * 2. `duplicate` below is safe on this list regardless, because a section it
   * can duplicate had to be IN the list to be named.
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

  /**
   * Show or hide a section from visitors. Second arg is the NEXT state.
   *
   * Hiding writes `hidden: true` into the block's own content through the
   * ordinary upsert, so it drafts, diffs and publishes like any other edit
   * rather than needing a column and a second write path.
   */
  toggleHidden: (blockId: number, hidden: boolean) => void;
  /**
   * Copy a section into the slot below it.
   *
   * Fire-and-forget from the caller's side: the copy is written immediately,
   * and the move that puts it below its source happens when the refetch
   * delivers the new row (see the implementation).
   */
  duplicate: (blockId: number) => void;
  /**
   * Why the last duplicate did not happen, or null.
   *
   * The provider needs a VISIBLE channel, not just its live region: the two
   * refusals here (a page with no free slot, and a rejected write) both leave
   * the section list looking exactly as it did before the click, and an
   * `aria-live` announcement is gone by the time a sighted PM looks for the
   * copy. `SectionList` renders this as a `role="alert"`, mirroring how
   * `AddPanel` surfaces its own full-site and write failures.
   */
  duplicateError: string | null;
  /**
   * A duplicate's write is in flight — the Duplicate controls must be disabled,
   * exactly as `AddPanel` disables its catalog on `upsert.isPending`.
   *
   * Named for the sibling `isMoving` (`reorder.isPending`), but deliberately
   * NOT `upsert.isPending`: this provider's one upsert mutation now serves both
   * `toggleHidden` and `duplicate`, and a hide writes to a slot it already
   * knows. Only slot ALLOCATION can collide, so only duplication gates on this.
   */
  isDuplicating: boolean;
}

const SiteEditorContext = createContext<SiteEditorContextValue | null>(null);

/**
 * A copy that has been WRITTEN but not yet moved below its source.
 *
 * Anchored on `(blockOrder, blockType)` rather than an id, for the same reason
 * `selectSlot` is: `useUpsertContentBlock` resolves to `void`, so the new row's
 * id does not exist on this side of the write. Unlike `selectSlot`, a wrong
 * match here would MOVE a section rather than merely select one, so the block
 * type is part of the anchor and not decoration.
 */
interface PendingCopy {
  slot: number;
  blockType: string;
  toOrder: number;
}

const PAGE_FULL_MESSAGE =
  'This page is full — it already has the maximum of 98 sections. Remove one before duplicating another.';
const DUPLICATE_FAILED_MESSAGE = 'We could not duplicate that section.';

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
  // No `pageId` override on the calls below: a toggle acts on the section the
  // PM is looking at, which is on the selected page — exactly the hook's
  // default (D-WRITE).
  const upsert = useUpsertContentBlock(communityId);
  const [announcement, setAnnouncement] = useState('');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  /*
   * The re-entrancy guard, kept in BOTH a ref and state on purpose.
   *
   * The ref is the correctness half and the state is only the rendering half.
   * Two `duplicate()` calls in one tick — a double click, or a held Enter —
   * both close over the same pre-update `isDuplicating`, so a state-only guard
   * reads `false` twice and lets both writes through. The ref is assigned
   * synchronously and is already `true` for the second call.
   */
  const duplicateInFlight = useRef(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

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

  const toggleHidden = useCallback(
    (blockId: number, hidden: boolean) => {
      // Resolved from `blocks`, not `movableSections`, so the guard below is
      // the one that actually runs — `movableSections` has already dropped the
      // hero and every tombstone.
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
      const blockType = upsertableBlockType(block.blockType);
      if (blockType === null) return;

      // `hidden` is `z.literal(true).optional()` in every block schema, so
      // ABSENCE is the only way to say "visible" — writing `hidden: false`
      // would fail validation. Unhiding therefore deletes the key.
      const next = { ...((block.content ?? {}) as Record<string, unknown>) };
      delete next.hidden;
      if (hidden) next.hidden = true;

      // KNOWN WINDOW, deliberately left open. `useUpsertContentBlock`
      // invalidates on success with no optimistic cache write (unlike
      // `useReorderBlocks`, which has an `onMutate`), so between this PATCH and
      // the refetch landing the cached content still carries the OLD flag. If
      // the inspector is open on this same section and the PM types inside that
      // window, `use-block-form`'s preserved-key splice re-applies the stale
      // value and the toggle appears to undo itself. Self-evidencing rather
      // than silent — the badge and the eye icon read from the same stale cache,
      // so they flip back too. Closing it means giving this mutation an
      // optimistic write, which touches the change model and the publish diff;
      // that is a larger change than the bug warrants pre-launch.
      upsert.mutate({ blockType, blockOrder: block.blockOrder, content: next });
    },
    [blocks, upsert],
  );

  /*
   * Duplicate a section: APPEND the copy, then move it below its source when
   * the refetch delivers it.
   *
   * ## Why not "free the slot below and insert there"
   *
   * Because no such operation exists. Three separate facts make the obvious
   * design impossible, and each alone would be enough:
   *
   *  - `upsertPublishedBlock` REPLACES the draft at the order it is given — it
   *    soft-deletes whatever sits there. Writing the copy at `sourceOrder + 1`
   *    while a section still occupies it destroys that section.
   *  - `moveTo` early-returns when nothing occupies the target order, so
   *    "shift the last section down to `order + 1`" is a silent no-op.
   *  - a reorder is an ARRAY MOVE that re-stamps the existing slot sequence, so
   *    "free slot 2" is not a state this API can even express.
   *
   * So the copy goes to the free slot at the end — the same `nextContentSlot`
   * allocation the Add panel makes — and is then dropped onto its source's
   * neighbour. `reorderTargetForCopy` computes that target.
   *
   * ## Why the move is deferred to an effect rather than awaited here
   *
   * The move needs the copy's id, and `useUpsertContentBlock` resolves to
   * `void`. The id only exists once the invalidation refetch lands, and the
   * continuation after `await` still holds the `blocks` array from BEFORE it —
   * the same trap documented on `AddPanel`'s slot-based selection. Handing the
   * intent to an effect keyed on `blocks` turns that race into a wait: the
   * effect re-runs as the list fills and fires the move whenever the copy
   * appears, in whatever order the refetch and the render happen to land. If it
   * never appears, nothing moves and the copy stays appended — which is a
   * legible outcome, not a corrupt one.
   *
   * No `pageId` override, matching `toggleHidden` above: `blocks` is already
   * narrowed to the selected page, so a section that can be duplicated is on
   * the selected page by construction — exactly the write hook's default
   * (D-WRITE). That also keeps the slot maths and the write on ONE page.
   */
  const duplicate = useCallback(
    (blockId: number) => {
      // Nothing at all while a write is in flight — not even an error. The PM
      // asked for the same thing twice; refusing quietly is the answer, and
      // `isDuplicating` has already disabled the control that got them here.
      if (duplicateInFlight.current) return;

      // Resolved from `blocks`, not `movableSections`: the hero and tombstone
      // refusals inside `planDuplicate` are the guard that actually runs, and
      // `movableSections` has already dropped both.
      const source = blocks.find((b) => b.id === blockId);
      if (!source) return;
      const plan = planDuplicate(blocks, blockId);
      if (plan === null) return;

      // Tombstones INCLUDED (they are staged deletions still holding a slot),
      // hero included — the same input the Add panel gives the allocator.
      const slot = nextContentSlot(blocks);
      if (slot === null) {
        setDuplicateError(PAGE_FULL_MESSAGE);
        return;
      }
      setDuplicateError(null);

      const toOrder = reorderTargetForCopy(movableSections, source.blockOrder, slot);

      duplicateInFlight.current = true;
      setIsDuplicating(true);
      void upsert
        .mutateAsync({ blockType: plan.blockType, blockOrder: slot, content: plan.content })
        .then(() => {
          // Armed only AFTER the write succeeded, so the effect below can never
          // be waiting for a row the server was never asked to create.
          if (toOrder !== null) {
            setPendingCopy({ slot, blockType: plan.blockType, toOrder });
          }
        })
        .catch((cause: unknown) => {
          setDuplicateError(
            cause instanceof Error ? cause.message : DUPLICATE_FAILED_MESSAGE,
          );
        })
        .finally(() => {
          // Released here and NOT held until `pendingCopy` clears, which was the
          // other candidate. Two reasons, and the second is decisive:
          //
          //  1. It buys almost nothing. `onSuccess` awaits its own
          //     `invalidateQueries`, and that promise resolves only once the
          //     active blocks query has REFETCHED — so the cache already holds
          //     the copy when this runs. What remains is the single React render
          //     that delivers it to `blocks`, which no human click can land in.
          //  2. It could wedge the button. `pendingCopy` clears only when a row
          //     matching (slot, blockType) appears; if a concurrent write took
          //     that slot it never does, and Duplicate would stay dead for the
          //     life of this provider instance. Trading a sub-frame race for a
          //     permanently broken control is the wrong direction.
          duplicateInFlight.current = false;
          setIsDuplicating(false);
        });
    },
    [blocks, movableSections, upsert],
  );

  /*
   * The copy has arrived — move it below its source.
   *
   * Through `moveTo`, not `reorder.mutate`, so this is the same single reorder
   * path the grip and the drop target use: one live-region announcement, and
   * one place where a move can be refused. Its guard is a real one here rather
   * than a formality — a co-manager who stages the neighbour for deletion
   * between the write and the refetch takes it out of `movableSections`, and
   * `moveTo` then declines instead of sending a request the server answers with
   * "That position is no longer a content section". The copy stays appended,
   * which is the same outcome as never arming the move at all.
   *
   * Cleared BEFORE the move fires, so a later refetch of the same list (the
   * reorder's own `onSettled` invalidation, for one) cannot re-fire it.
   */
  useEffect(() => {
    if (pendingCopy === null) return;
    const copy = blocks.find(
      (b) => b.blockOrder === pendingCopy.slot && b.blockType === pendingCopy.blockType,
    );
    if (!copy) return;
    setPendingCopy(null);
    moveTo(copy.id, pendingCopy.toOrder);
  }, [blocks, moveTo, pendingCopy]);

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
      toggleHidden,
      duplicate,
      duplicateError,
      isDuplicating,
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
      toggleHidden,
      duplicate,
      duplicateError,
      isDuplicating,
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
