'use client';

/**
 * Confirm-then-remove with a time-boxed undo, for the urgent notice.
 *
 * The same shape as `use-undoable-remove.ts` (canvas sections) and for the same
 * reason: there is no un-clear endpoint. `DELETE` nulls the columns and nothing
 * on the server remembers the text, so undo has to re-POST it — which means
 * capturing `{ text, expiresAt }` BEFORE the delete.
 *
 * Two differences from the section version, both because of what a notice is:
 *
 * - **The undo re-posts a PUBLIC banner.** An undo that fired after its window,
 *   or after the manager had already posted a different notice, would put stale
 *   emergency text back in front of residents. The monotonic token makes that
 *   impossible by construction rather than merely unlikely: a superseded or
 *   expired undo is a no-op, not a wrong write.
 * - **A re-post whose original expiry has since passed is dropped.** Replaying
 *   it would write a row that never renders, so the manager would see "restored"
 *   and residents would see nothing. Better to tell them it cannot be restored.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useClearUrgentNotice, useSetUrgentNotice } from '@/hooks/use-urgent-notice';

/**
 * How long Undo stays offered. Matches the canvas removal window so the two
 * toasts in this editor behave identically.
 */
export const NOTICE_UNDO_WINDOW_MS = 10_000;

interface PendingRestore {
  token: number;
  text: string;
  expiresAt: string | null;
}

export interface UseUndoableNoticeRemoveResult {
  isConfirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  /** Opens the confirmation. Removes nothing. */
  requestRemove: () => void;
  /** Runs the delete. Call from the dialog's destructive action. */
  confirmRemove: () => void;
  isPending: boolean;
}

export function useUndoableNoticeRemove(
  communityId: number,
  notice: { text: string; expiresAt: string | null } | null,
  /**
   * Called once the removal has landed.
   *
   * The caller uses this to move focus somewhere that still exists. Radix hands
   * focus back to the control that opened the confirmation, but that control
   * lives inside the live-notice card, which unmounts the instant the notice
   * clears — so focus would otherwise land on `<body>` and put the Undo action
   * (the only way back) out of keyboard reach.
   */
  onRemoved?: () => void,
): UseUndoableNoticeRemoveResult {
  const clear = useClearUrgentNotice(communityId);
  const restore = useSetUrgentNotice(communityId);
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

  // Unmounting the panel must not leave a live timer holding text that could be
  // re-published into a state this session no longer knows about.
  useEffect(() => release, [release]);

  const undo = useCallback(
    (token: number) => {
      const pending = pendingRef.current;
      // Expired, already used, or superseded by a later removal.
      if (pending === null || pending.token !== token) return;
      release();

      // An expiry that has passed in the meantime would be rejected by the
      // service anyway (it refuses a past expiry). Say so plainly instead of
      // surfacing a validation error the manager did not cause.
      if (pending.expiresAt !== null && new Date(pending.expiresAt).getTime() <= Date.now()) {
        toast.error('That notice had already expired, so it can’t be restored.');
        return;
      }

      restore.mutate(
        { text: pending.text, expiresAt: pending.expiresAt },
        {
          onSuccess: () => toast.success('Urgent notice restored — it’s live again.'),
          onError: (error) =>
            toast.error(`We couldn’t restore that notice. ${error.message}`),
        },
      );
    },
    [release, restore],
  );

  const confirmRemove = useCallback(() => {
    setConfirmOpen(false);
    if (notice === null) return;

    // Captured BEFORE the delete — afterwards the text is unrecoverable from
    // the client.
    const captured = { text: notice.text, expiresAt: notice.expiresAt };

    clear.mutate(undefined, {
      onSuccess: () => {
        const token = tokenRef.current + 1;
        tokenRef.current = token;
        // Supersedes any prior pending removal rather than stacking: the older
        // token no longer matches, so its Undo can no longer fire.
        release();
        pendingRef.current = { token, ...captured };
        timerRef.current = setTimeout(release, NOTICE_UNDO_WINDOW_MS);

        toast.success('Urgent notice removed from your website.', {
          duration: NOTICE_UNDO_WINDOW_MS,
          dismissible: true,
          closeButton: true,
          action: { label: 'Undo', onClick: () => undo(token) },
          onDismiss: release,
          onAutoClose: release,
        });

        onRemoved?.();
      },
      onError: (error) =>
        toast.error(`We couldn’t remove that notice. ${error.message}`),
    });
  }, [clear, notice, onRemoved, release, undo]);

  const requestRemove = useCallback(() => setConfirmOpen(true), []);

  return {
    isConfirmOpen,
    setConfirmOpen,
    requestRemove,
    confirmRemove,
    isPending: clear.isPending || restore.isPending,
  };
}
