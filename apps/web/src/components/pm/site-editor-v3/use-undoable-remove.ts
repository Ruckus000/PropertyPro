'use client';

/**
 * Confirm-then-remove with a time-boxed undo, for one canvas section.
 *
 * Two things make this more than a `mutate()` call:
 *
 * 1. **There is no undelete endpoint.** `DELETE /api/v1/pm/site/blocks` removes
 *    by `blockOrder`; nothing on the server remembers what used to be there in
 *    a form a client can ask for back. So undo has to *re-write* the section,
 *    which means capturing `blockType` / `blockOrder` / `content` BEFORE the
 *    delete and replaying them through the upsert. That works for both removal
 *    shapes because `upsertPublishedBlock` soft-deletes whatever live draft sits
 *    at the order — the vanished draft's slot is empty (plain re-insert), and a
 *    published section's slot holds the tombstone the delete just staged, which
 *    the re-insert replaces (cancelling the staged removal). See
 *    `apps/web/src/lib/services/site-blocks-service.ts`.
 *
 *    Phase 11b-3 adds `pageId` to that captured set (D-UNDO). The write hooks
 *    otherwise read the CURRENTLY-selected page, and "currently" is the wrong
 *    tense for a replay: an undo issued after the PM switched pages would
 *    restore the section onto the page they are looking at rather than the one
 *    they removed it from — silently, with the PM believing they undid
 *    something. The page is part of what "this section was here" means, so it
 *    is captured at removal time alongside the type, order and content, and
 *    passed back as an explicit override on both the delete and the replay.
 *
 * 2. **An expired undo must be impossible, not merely ineffective.** The
 *    captured payload is released when the window closes, and each removal
 *    carries a token the undo closure must still match. A toast that outlives
 *    its window (or a second removal in between) therefore cannot resurrect a
 *    stale section at an order that has since been reused — the undo is a
 *    no-op by construction rather than a wrong write.
 *
 * The hero is deliberately unrepresentable here: `RestorableBlockType` is the
 * upsert contract's own union, so a section whose type the upsert cannot express
 * simply gets no Undo affordance instead of a cast that would 400 at runtime.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  useDeleteContentBlock,
  type SiteBlockSummary,
  type UpsertContentBlockInput,
} from '@/hooks/use-content-blocks';
import { useSelectedSitePage } from '@/hooks/use-selected-site-page';
import { useUndoableRemoveHost } from './undoable-remove-context';
import { sectionLabel } from './section-label';

export { UNDO_WINDOW_MS } from './undoable-remove-context';

type RestorableBlockType = UpsertContentBlockInput['blockType'];

/**
 * The block types the upsert contract can write — i.e. the ones a removal can
 * be undone for. `hero` is absent on purpose: it is pinned to slot 1 and has no
 * remove control at all.
 */
const RESTORABLE_BLOCK_TYPES = [
  'text',
  'image',
  'announcements',
  'documents',
  'meetings',
  'contact',
  'faq',
  'gallery',
  'amenities',
] as const satisfies readonly RestorableBlockType[];

function isRestorable(blockType: string): blockType is RestorableBlockType {
  return (RESTORABLE_BLOCK_TYPES as readonly string[]).includes(blockType);
}

export interface UseUndoableRemoveResult {
  /** Whether the confirmation dialog is open. */
  isConfirmOpen: boolean;
  /** Bound to the dialog's `onOpenChange` — Escape/overlay/cancel all route here. */
  setConfirmOpen: (open: boolean) => void;
  /** Opens the confirmation. Does not delete anything. */
  requestRemove: () => void;
  /** Runs the delete. Call from the dialog's destructive action. */
  confirmRemove: () => void;
  /** True while the delete or a restore is in flight. */
  isPending: boolean;
}

/**
 * @param communityId Both mutations are community-scoped.
 * @param block The section the controls act on.
 */
export function useUndoableRemove(
  communityId: number,
  block: SiteBlockSummary,
): UseUndoableRemoveResult {
  const remove = useDeleteContentBlock(communityId);
  const selectedPageId = useSelectedSitePage();
  const { offerUndo } = useUndoableRemoveHost();
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  const label = sectionLabel(block.blockType);

  const confirmRemove = useCallback(() => {
    setConfirmOpen(false);

    // Captured BEFORE the delete — afterwards the row is gone and the content
    // is unrecoverable from the client.
    //
    // The block's own page wins over the current selection: they agree today
    // (the canvas only shows the selected page's blocks) but the correctness of
    // the replay must not depend on that coincidence. The selection is the
    // fallback only for an unadopted pre-11b row, whose `pageId` is null.
    const removedFromPageId = block.pageId ?? selectedPageId;
    const restorable = isRestorable(block.blockType)
      ? ({
          blockType: block.blockType,
          blockOrder: block.blockOrder,
          content: block.content,
          pageId: removedFromPageId,
        } satisfies UpsertContentBlockInput)
      : null;

    remove.mutate(
      { blockOrder: block.blockOrder, pageId: removedFromPageId },
      {
        onSuccess: ({ staged }) => {
          const message = staged
            ? `${label} section will be removed when you publish.`
            : `${label} section removed.`;

          if (restorable === null) {
            toast.success(message);
            return;
          }

          // Handed UP. This component is about to unmount — the tombstone the
          // delete just wrote has a new row id and no view, so `SectionShell`
          // leaves the canvas on the refetch — and an undo owned here would go
          // with it.
          offerUndo({ message, input: restorable, label });
        },
        onError: (error) => {
          toast.error(`We couldn't remove that section. ${error.message}`);
        },
      },
    );
  }, [block, label, offerUndo, remove, selectedPageId]);

  const requestRemove = useCallback(() => setConfirmOpen(true), []);

  return {
    isConfirmOpen,
    setConfirmOpen,
    requestRemove,
    confirmRemove,
    // The restore's pending state belongs to the host now — it outlives this
    // component, so it could not be reported here truthfully anyway.
    isPending: remove.isPending,
  };
}
