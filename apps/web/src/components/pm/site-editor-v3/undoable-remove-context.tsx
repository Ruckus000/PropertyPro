'use client';

/**
 * The pending "Undo" behind a removed section, held ABOVE the section.
 *
 * ## Why this is not just state inside `useUndoableRemove`
 *
 * It was, and the lifetime was wrong in both directions.
 *
 * `useUndoableRemove` runs inside `SectionShell`, which is keyed on `block.id`
 * and rendered from `blocksForPage(...).filter(hasView)`. Removing a section
 * inserts a TOMBSTONE — a NEW row, with a new id and a type no view renders —
 * so the original id leaves the list on the refetch the delete triggers, and
 * `SectionShell` unmounts. That is the ORDINARY path, not an edge case: the
 * component that owns the undo is destroyed by the very action that offers it.
 *
 * Consequences while the state lived there, both observed:
 *
 *  - The unmount cleanup dismissed the toast it had just created, so the Undo
 *    could vanish before the PM could reach it.
 *  - `@tanstack/query-core` gates per-call mutation callbacks on
 *    `hasListeners()`, so if the unmount won the race the `onSuccess` that
 *    CREATES the toast never ran at all.
 *
 * Held here, the payload outlives both the section and a page switch. The
 * `pageId` captured at removal time (D-UNDO) is what makes surviving a page
 * switch correct rather than dangerous: the replay names the page the section
 * came from, so undoing after switching restores it where it was, instead of
 * onto whatever the PM is now looking at. Before the hoist that capture was
 * effectively dead — the only path that could exercise it destroyed the payload
 * first.
 *
 * Mounted in `EditorRoot` INSIDE `SelectedSitePageProvider` (the restore write
 * needs it) and OUTSIDE `SiteEditorProvider`'s `key={effectivePageId}` (D-SEL),
 * so a page switch does not take it with it.
 */

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  useUpsertContentBlock,
  type UpsertContentBlockInput,
} from '@/hooks/use-content-blocks';

/**
 * How long Undo stays offered. Long enough to notice the toast and act, short
 * enough that the captured payload isn't held against a slot the PM has since
 * refilled.
 */
export const UNDO_WINDOW_MS = 10_000;

interface PendingRestore {
  token: number;
  input: UpsertContentBlockInput;
}

export interface OfferUndoInput {
  /** Toast copy. The caller owns it — staged and immediate removals differ. */
  message: string;
  /** Exactly what to write back, including the page it came from (D-UNDO). */
  input: UpsertContentBlockInput;
  /** "Text", "Gallery" … for the restore confirmation. */
  label: string;
}

export interface UndoableRemoveContextValue {
  /** Announce a removal and offer Undo for `UNDO_WINDOW_MS`. */
  offerUndo: (input: OfferUndoInput) => void;
}

const UndoableRemoveContext = createContext<UndoableRemoveContextValue | null>(null);

export function UndoableRemoveProvider({
  communityId,
  children,
}: {
  communityId: number;
  children: React.ReactNode;
}) {
  const restore = useUpsertContentBlock(communityId);

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

  // Only on the editor's own teardown — this provider outlives both the section
  // and the page switch, so by the time this runs there is no session left to
  // hold a payload for.
  useEffect(() => release, [release]);

  const undo = useCallback(
    (token: number, label: string) => {
      const pending = pendingRef.current;
      // Expired, already used, or superseded by a later removal.
      if (pending === null || pending.token !== token) return;
      release();

      restore.mutate(pending.input, {
        onSuccess: () => toast.success(`${label} section restored.`),
        onError: (error) =>
          toast.error(`We couldn't restore that section. ${error.message}`),
      });
    },
    [release, restore],
  );

  const offerUndo = useCallback(
    ({ message, input, label }: OfferUndoInput) => {
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      // A prior pending removal is superseded, not stacked: its token no longer
      // matches, so its Undo can no longer fire.
      release();
      pendingRef.current = { token, input };
      timerRef.current = setTimeout(release, UNDO_WINDOW_MS);

      toast.success(message, {
        duration: UNDO_WINDOW_MS,
        dismissible: true,
        closeButton: true,
        action: { label: 'Undo', onClick: () => undo(token, label) },
        onDismiss: release,
        onAutoClose: release,
      });
    },
    [release, undo],
  );

  return (
    <UndoableRemoveContext.Provider value={{ offerUndo }}>
      {children}
    </UndoableRemoveContext.Provider>
  );
}

/**
 * THROWS outside a provider, deliberately.
 *
 * A silent fallback here would mean "removals stop offering Undo" — a feature
 * that fails off, with nothing on screen to say so. `useSelectedSitePage`
 * returns `null` outside its provider because a null page has a correct
 * meaning (D-WRITE); "no undo host" has none.
 */
export function useUndoableRemoveHost(): UndoableRemoveContextValue {
  const context = useContext(UndoableRemoveContext);
  if (context === null) {
    throw new Error(
      'useUndoableRemoveHost must be used within an UndoableRemoveProvider. ' +
        'The editor mounts one in EditorRoot, above the page-keyed subtree.',
    );
  }
  return context;
}
