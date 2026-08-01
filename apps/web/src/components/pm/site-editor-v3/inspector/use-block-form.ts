'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAutosave, stableStringify, type UseAutosaveResult } from '../useAutosave';
import { useAutosaveReporter } from './autosave-status';

export interface UseBlockFormOptions<TDraft> {
  /** Raw stored content for this section, straight from the blocks query. */
  content: unknown;
  /**
   * Tolerant parse: raw stored content -> editable draft. Must not throw and
   * must handle content that fails the block's schema — a PM whose block went
   * invalid needs the form to open so they can fix it.
   */
  toDraft: (content: unknown) => TDraft;
  /**
   * Draft -> the exact object to persist, or `null` when the draft is not yet
   * valid enough to save (e.g. a required field is empty).
   *
   * This is where empty strings must be dropped rather than sent. `''` is a
   * real value to `stableStringify`, so `{body: ''}` and `{}` are different
   * keys — emptying and retyping a field would write twice, and `''` fails
   * `z.string().min(1)` at publish anyway.
   */
  toCanonical: (draft: TDraft) => unknown | null;
  /** Persist. Rejections drive `useAutosave`'s retry/backoff, so let them throw. */
  save: (content: unknown) => Promise<void>;
}

export interface UseBlockFormResult<TDraft> {
  draft: TDraft;
  setDraft: (next: TDraft | ((prev: TDraft) => TDraft)) => void;
  autosave: UseAutosaveResult;
  /** True when the draft cannot be persisted yet. Drives inline validation. */
  isIncomplete: boolean;
}

/**
 * The shared plumbing behind every per-block inspector form: a local draft, a
 * debounced write, and the reconciliation rules that keep the two honest.
 *
 * One hook rather than the same forty lines in five forms — the interesting
 * parts here are subtle enough that five copies would drift.
 *
 * ## Resync, and the echo problem
 *
 * `useState(props.content)` never resyncs, so the draft has to be reconciled
 * against incoming content explicitly. The naive version compares object
 * identity and clobbers the PM mid-keystroke on every refetch. The version
 * below compares CONTENT, the same instinct as `UrgentNoticeForm`.
 *
 * But content comparison alone is not enough under autosave, because the
 * refetch that follows a save returns *exactly what we just wrote*. By content
 * that reads as an incoming change, and adopting it would overwrite the draft
 * with a version up to one debounce window stale. So the last value handed to
 * `save` is remembered, and content matching it is recognised as our own echo
 * and adopted as the baseline without touching the draft.
 *
 * Content that matches neither the baseline nor our echo is genuinely foreign —
 * a discard, a revert, another tab. It is adopted only when the draft is clean.
 * When the PM has unsaved edits their text wins and last-writer-wins settles
 * it. That is a deliberate limitation of this phase, not conflict resolution;
 * it is pinned by a test so a future change to it is a decision, not a drift.
 */
export function useBlockForm<TDraft>({
  content,
  toDraft,
  toCanonical,
  save,
}: UseBlockFormOptions<TDraft>): UseBlockFormResult<TDraft> {
  const [draft, setDraft] = useState<TDraft>(() => toDraft(content));
  // The server content this draft is reconciled against — the CONTENT, not
  // just its key, because "has the PM edited anything" is answered by
  // re-projecting it (see the comparison below).
  const [synced, setSynced] = useState<{ content: unknown; key: string }>(() => ({
    content,
    key: stableStringify(content),
  }));

  // What we last handed to `save` — used to recognise our own echo.
  const lastSentKeyRef = useRef<string | null>(null);

  // Set during render when foreign content is adopted; consumed by the effect
  // below, which reseats the autosave baseline so the adoption is not mistaken
  // for a PM edit.
  const adoptedRef = useRef(false);

  // Latest callbacks, read at fire time. `toCanonical`/`toDraft`/`save` are
  // typically inline arrows and change identity every render; capturing them
  // in the effects below would re-arm on every keystroke.
  const toDraftRef = useRef(toDraft);
  toDraftRef.current = toDraft;
  const toCanonicalRef = useRef(toCanonical);
  toCanonicalRef.current = toCanonical;
  const saveRef = useRef(save);
  saveRef.current = save;

  const canonical = useMemo(() => toCanonical(draft), [draft, toCanonical]);

  // Reconcile during render rather than in an effect: an effect runs after
  // paint, which would show the PM one frame of content we are about to
  // replace. React re-runs this component immediately with the new state.
  const incomingKey = stableStringify(content);
  if (incomingKey !== synced.key) {
    const isEcho = incomingKey === lastSentKeyRef.current;

    // Projection vs projection, NOT projection vs raw stored content.
    //
    // Comparing `canonical` against the stored content directly only agrees
    // when toDraft -> toCanonical round-trips exactly, and it deliberately
    // does not everywhere: `HeroForm` migrates a legacy `heroImagePath` into
    // `photos`, and any form that omits a default (a stored
    // `variant: 'standard'`) drops it. Those blocks read as permanently dirty
    // and would never adopt a foreign change.
    const baselineDraft = toDraftRef.current(synced.content);
    const baselineCanonical = toCanonicalRef.current(baselineDraft);
    const isClean =
      canonical === null || baselineCanonical === null
        ? // One side is unsaveable, and `stableStringify(null)` is 'null' on
          // both — so comparing projections here would call a PM who just
          // cleared a required field "clean" against a stored block that is
          // also incomplete, and clobber their draft. Fall back to comparing
          // the drafts themselves: conservative, and still adopts when the
          // draft is genuinely untouched.
          stableStringify(draft) === stableStringify(baselineDraft)
        : stableStringify(canonical) === stableStringify(baselineCanonical);

    // Advance the baseline unconditionally, so a foreign change arriving while
    // the PM has unsaved edits is recorded as seen rather than re-evaluated on
    // every subsequent render.
    setSynced({ content, key: incomingKey });
    if (!isEcho && isClean) {
      setDraft(toDraftRef.current(content));
      // Adopting is not an edit. Without this the changed `canonical` arms the
      // debounce and writes the adopted content back one window later — a
      // write, and a publish-diff entry, that no PM action caused. Deferred to
      // an effect because `markClean` cannot be called during render.
      adoptedRef.current = true;
    }
  }

  const persist = useCallback(async (value: unknown) => {
    if (value === null) return;
    lastSentKeyRef.current = stableStringify(value);
    await saveRef.current(value);
  }, []);

  const autosave = useAutosave(canonical, persist, {
    enabled: canonical !== null,
    // The form is already gone, so the status line cannot carry this and the
    // retry is gated on being mounted. A toast outlives the tree and is the
    // only surface left. Routine since 11b-3: a focus refetch can find that a
    // co-manager removed the page being edited, selection repair moves the
    // editor to home, and the resulting remount flushes this form at a page the
    // server no longer has.
    onUnmountedError: (error) =>
      toast.error(`We couldn't save your last change. ${error.message}`),
  });

  // Consume the adoption flag. Runs after the render that adopted, and after
  // the debounce effect has armed — which is fine, because `markClean` cancels
  // that debounce and `runSave` re-checks the baseline at fire time anyway.
  const { markClean } = autosave;
  useEffect(() => {
    if (!adoptedRef.current) return;
    adoptedRef.current = false;
    markClean(canonical);
  }, [markClean, canonical]);

  // Report save state to the top bar's StatusLine, and hand the slot back on
  // unmount so closing a panel mid-save does not strand a spinner.
  const { report, release } = useAutosaveReporter();
  const { status, lastSavedAt, error, retry, flush } = autosave;
  useEffect(() => {
    report({ status, lastSavedAt, error, onRetry: retry });
  }, [report, status, lastSavedAt, error, retry]);

  // Flush on unmount.
  //
  // `EditorShell` unmounts the whole editor when the viewport crosses 768px,
  // and crossing 1280px swaps the docked column for the overlay sheet — both
  // would otherwise drop whatever was inside the debounce window. Kept in a ref
  // so this effect runs exactly once, on real unmount, rather than re-arming
  // whenever `flush` changes identity.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(
    () => () => {
      void flushRef.current();
      releaseRef.current();
    },
    [],
  );

  return { draft, setDraft, autosave, isIncomplete: canonical === null };
}
