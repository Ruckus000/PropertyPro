'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  /** Epoch ms of the last successful save; null until one lands. */
  lastSavedAt: number | null;
  error: Error | null;
}

// Defaulted so the common `UseAutosaveResult` spelling keeps working; only
// `markClean` needs the parameter.
export interface UseAutosaveResult<T = unknown> extends AutosaveState {
  /** Manual attempt after a failure (also resets the retry budget). */
  retry: () => void;
  /** Cancel the debounce and save now. Resolves when the write settles. */
  flush: () => Promise<void>;
  /**
   * Adopt `value` as the already-saved baseline, cancelling any pending write.
   *
   * For the case where the value changed but NOT because the user edited it —
   * a consumer reconciling against fresh server content. Without this, adopting
   * that content arms the debounce and writes it straight back one window
   * later, producing a write (and a publish-diff entry) that no user action
   * caused.
   *
   * Safe to call after the debounce effect has already armed: `runSave`
   * re-reads `savedKeyRef` at fire time and returns early when the pending
   * value matches it, and `flush()` goes through the same guard.
   */
  markClean: (value: T) => void;
}

export interface UseAutosaveOptions {
  /** Debounce window. One save per quiet period, not one per keystroke. */
  delayMs?: number;
  /** When false, changes are tracked but never written. */
  enabled?: boolean;
  /**
   * A save that failed with nobody left to tell.
   *
   * The status line and the retry both need a mounted component, so a failure
   * during the unmount flush is swallowed: `setState` is skipped, no retry is
   * scheduled, and the status slot has already been handed back. Silent.
   *
   * That went from rare to routine in 11b-3. A pages refetch on window focus can
   * discover that a co-manager removed the page being edited; selection repair
   * then moves the editor to home, which remounts the subtree (D-SEL) and
   * flushes the open form — at a page the server no longer has. The PM gets a
   * toast saying they were moved, and the last debounce window of typing
   * disappears with no error anywhere.
   *
   * Called ONLY when the component is already gone. A mounted failure still
   * goes to the status line, which can retry.
   */
  onUnmountedError?: (error: Error) => void;
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 800;

/**
 * Backoff for automatic retries, in order. Its length is the retry budget:
 * two automatic retries after the first failure, then the hook stops and waits
 * for `retry()` or the next edit. Retrying forever turns a dead endpoint into a
 * background request storm and hides the failure from the PM.
 */
const RETRY_BACKOFF_MS = [600, 2400] as const;

/**
 * Order-independent deep serialization, used only to compare "is this value
 * actually different from what we last saved".
 *
 * Kept local on purpose: it is a comparison detail of this hook, not a shared
 * utility, and inspector values are small plain JSON (block content).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Debounced autosave for a single editable value.
 *
 * Every write in this editor already lands in the draft layer, so there is no
 * "save draft" action to model — this hook just decides *when* to call the
 * caller's existing upsert, and reports the outcome for `StatusLine`.
 *
 * Guarantees that the editor's trustworthiness depends on:
 *  - **Nothing on mount.** The value present at mount is treated as already
 *    saved, so opening a section never manufactures a phantom write (and never
 *    stamps a "Draft saved" the PM did not cause).
 *  - **Nothing for a no-op.** A value deep-equal to the last saved one is
 *    skipped, so focus/blur churn and revert-to-original edits are free.
 *  - **One request per burst**, and at most **one queued follow-up** while a
 *    request is in flight — two writes never race for the same block.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options: UseAutosaveOptions = {},
): UseAutosaveResult<T> {
  const { delayMs = DEFAULT_AUTOSAVE_DELAY_MS, enabled = true, onUnmountedError } = options;

  // In a ref because `runSave` is a `useCallback` that must not re-identify on
  // every render — the debounce effect depends on it.
  const onUnmountedErrorRef = useRef(onUnmountedError);
  onUnmountedErrorRef.current = onUnmountedError;

  const [state, setState] = useState<AutosaveState>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
  });

  const key = useMemo(() => stableStringify(value), [value]);

  // Latest value/callback, read at fire time rather than captured per render —
  // a debounced save must write what the PM last typed, not what was on screen
  // when the timer was armed.
  const valueRef = useRef(value);
  valueRef.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;

  // Seeded with the mount value: that is the "already saved" baseline.
  const savedKeyRef = useRef(key);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const attemptsRef = useRef(0);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const clearRetry = useCallback(() => {
    if (retryRef.current !== null) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  const runSave = useCallback((): Promise<void> => {
    // A change arriving mid-flight becomes the single queued follow-up. Callers
    // awaiting `flush()` get the in-flight promise so they never see undefined.
    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }

    const pendingValue = valueRef.current;
    const pendingKey = stableStringify(pendingValue);
    if (pendingKey === savedKeyRef.current) return Promise.resolve();

    clearRetry();
    setState((prev) => ({ ...prev, status: 'saving' }));

    const attempt = (async () => {
      try {
        await saveRef.current(pendingValue);
        savedKeyRef.current = pendingKey;
        attemptsRef.current = 0;
        const savedAt = Date.now();
        if (mountedRef.current) {
          setState({ status: 'saved', lastSavedAt: savedAt, error: null });
        }
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught));
        attemptsRef.current += 1;
        if (mountedRef.current) {
          setState((prev) => ({ status: 'error', lastSavedAt: prev.lastSavedAt, error }));
        } else {
          // Nobody left to tell: no status line, and the retry below is gated on
          // being mounted too. Without this the write is lost in silence.
          onUnmountedErrorRef.current?.(error);
        }
        const backoff = RETRY_BACKOFF_MS[attemptsRef.current - 1];
        if (backoff !== undefined && mountedRef.current) {
          retryRef.current = setTimeout(() => {
            retryRef.current = null;
            void runSave();
          }, backoff);
        }
      } finally {
        inFlightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          // A newer value supersedes any scheduled retry, and earns a fresh
          // retry budget — the previous failure was about older content.
          clearRetry();
          attemptsRef.current = 0;
          void runSave();
        }
      }
    })();

    inFlightRef.current = attempt;
    return attempt;
  }, [clearRetry]);

  useEffect(() => {
    // Deep-equal to the last saved value (including on mount): nothing to do.
    if (!enabled || key === savedKeyRef.current) return;
    attemptsRef.current = 0;
    clearDebounce();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void runSave();
    }, delayMs);
    return clearDebounce;
  }, [key, enabled, delayMs, clearDebounce, runSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearDebounce();
      clearRetry();
    };
  }, [clearDebounce, clearRetry]);

  const retry = useCallback(() => {
    clearDebounce();
    clearRetry();
    attemptsRef.current = 0;
    void runSave();
  }, [clearDebounce, clearRetry, runSave]);

  const flush = useCallback(async () => {
    clearDebounce();
    await runSave();
  }, [clearDebounce, runSave]);

  const markClean = useCallback(
    (next: T) => {
      // Reseat the baseline the effect and the retry closure both read. They
      // read `savedKeyRef` at fire time rather than capturing it, so this is
      // observed by a debounce that has ALREADY been armed — `runSave` bails
      // when the pending value matches the baseline.
      clearDebounce();
      clearRetry();
      savedKeyRef.current = stableStringify(next);
      attemptsRef.current = 0;
    },
    [clearDebounce, clearRetry],
  );

  return { ...state, retry, flush, markClean };
}
