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

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useDeleteContentBlock,
  useUpsertContentBlock,
  type SiteBlockSummary,
  type UpsertContentBlockInput,
} from '@/hooks/use-content-blocks';
import { useSelectedSitePage } from '@/hooks/use-selected-site-page';
import { sectionLabel } from './section-label';

/**
 * How long Undo stays offered. Long enough to notice the toast and act, short
 * enough that the captured payload isn't held against a slot the PM has since
 * refilled.
 */
export const UNDO_WINDOW_MS = 10_000;

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

interface PendingRestore {
  token: number;
  input: UpsertContentBlockInput;
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
  const restore = useUpsertContentBlock(communityId);
  const selectedPageId = useSelectedSitePage();
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  const pendingRef = useRef<PendingRestore | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);

  const release = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Unmounting the canvas (navigating away, discarding drafts) must not leave a
  // live timer holding a payload for a slot this session no longer owns.
  useEffect(() => release, [release]);

  const label = sectionLabel(block.blockType);

  const undo = useCallback(
    (token: number) => {
      const pending = pendingRef.current;
      // Expired, already used, or superseded by a later removal.
      if (pending === null || pending.token !== token) return;
      release();

      restore.mutate(pending.input, {
        onSuccess: () => {
          toast.success(`${label} section restored.`);
        },
        onError: (error) => {
          toast.error(`We couldn't restore that section. ${error.message}`);
        },
      });
    },
    [label, release, restore],
  );

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

          const token = tokenRef.current + 1;
          tokenRef.current = token;
          // A prior pending removal is superseded, not stacked: its token no
          // longer matches, so its Undo can no longer fire.
          release();
          pendingRef.current = { token, input: restorable };
          timerRef.current = setTimeout(release, UNDO_WINDOW_MS);

          toast.success(message, {
            duration: UNDO_WINDOW_MS,
            dismissible: true,
            closeButton: true,
            action: {
              label: 'Undo',
              onClick: () => undo(token),
            },
            onDismiss: release,
            onAutoClose: release,
          });
        },
        onError: (error) => {
          toast.error(`We couldn't remove that section. ${error.message}`);
        },
      },
    );
  }, [block, label, release, remove, selectedPageId, undo]);

  const requestRemove = useCallback(() => setConfirmOpen(true), []);

  return {
    isConfirmOpen,
    setConfirmOpen,
    requestRemove,
    confirmRemove,
    isPending: remove.isPending || restore.isPending,
  };
}
