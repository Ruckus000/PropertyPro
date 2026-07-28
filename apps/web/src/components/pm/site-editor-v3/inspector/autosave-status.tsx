'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AutosaveState } from '../useAutosave';

export interface AutosaveStatusValue extends AutosaveState {
  onRetry?: () => void;
}

const IDLE: AutosaveStatusValue = { status: 'idle', lastSavedAt: null, error: null };

interface AutosaveStatusContextValue {
  value: AutosaveStatusValue;
  /** Called by the active form on every autosave state change. */
  report: (next: AutosaveStatusValue) => void;
  /** Called by the active form on unmount. See `release` below. */
  release: () => void;
}

const AutosaveStatusContext = createContext<AutosaveStatusContextValue | null>(null);

/**
 * Carries the active inspector form's save state up to `StatusLine` in the top
 * bar.
 *
 * `StatusLine` has been mounted idle since Phase 3 with a comment naming the
 * per-block forms as the consumer it was waiting for. This is that consumer.
 *
 * A context rather than lifted state because the form is code-split, several
 * levels down, and rendered in two different presentations (docked column and
 * overlay sheet) — threading a callback through both would mean `Inspector`,
 * `InspectorSheet` and `InspectorBody` all growing a prop none of them use.
 *
 * Exactly one form can be mounted at a time (there is one selection), so this
 * deliberately models a single slot rather than a registry of savers.
 */
export function AutosaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AutosaveStatusValue>(IDLE);

  const report = useCallback((next: AutosaveStatusValue) => setValue(next), []);

  /**
   * Closing a panel mid-save must not strand a spinner in the top bar.
   *
   * `lastSavedAt` is preserved rather than reset: the write itself is already
   * in flight against the draft layer and will land whether or not this panel
   * is open, so throwing away the last known save time would tell the PM less
   * than we actually know. Only the in-progress/failed indicator is dropped.
   */
  const release = useCallback(
    () => setValue((prev) => ({ status: 'idle', lastSavedAt: prev.lastSavedAt, error: null })),
    [],
  );

  const contextValue = useMemo(
    () => ({ value, report, release }),
    [value, report, release],
  );

  return (
    <AutosaveStatusContext.Provider value={contextValue}>
      {children}
    </AutosaveStatusContext.Provider>
  );
}

/** Read the reported state. Returns idle outside a provider (tests, storybook). */
export function useAutosaveStatus(): AutosaveStatusValue {
  return useContext(AutosaveStatusContext)?.value ?? IDLE;
}

/**
 * Reporter side, for a form. No-ops outside a provider so a form stays
 * renderable in isolation.
 */
export function useAutosaveReporter(): Pick<AutosaveStatusContextValue, 'report' | 'release'> {
  const context = useContext(AutosaveStatusContext);
  const noop = useCallback(() => {}, []);
  return context ?? { report: noop, release: noop };
}
