'use client';

import { useCallback, useEffect, useState } from 'react';

export const PANEL_MIN_WIDTH = 280;
export const PANEL_MAX_WIDTH = 560;
export const PANEL_DEFAULT_WIDTH = 340;

const STORAGE_KEY = 'pp-site-editor-panel-width';

/**
 * Clamp to the supported range; anything unparseable falls back to the default.
 *
 * The type check before `Number()` is load-bearing, not defensive noise:
 * `Number('')`, `Number(null)` and `Number([])` are all `0`, which is finite,
 * so a naive coercion would clamp an empty or corrupt localStorage entry to the
 * *minimum* width instead of the default — the panel would come back collapsed
 * and the user would have to discover the resizer to fix it.
 */
export function clampPanelWidth(value: unknown): number {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else {
    return PANEL_DEFAULT_WIDTH;
  }
  if (!Number.isFinite(n)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(n)));
}

/**
 * Persisted tool-panel width.
 *
 * Starts at the default on both server and first client render so hydration
 * matches, then adopts the stored value in an effect. A stored value outside
 * the supported range — a corrupt entry, or one written by a future build with
 * a different range — is clamped rather than honoured, so the panel can never
 * come back at a width that hides the canvas.
 */
export function usePanelWidth(): [number, (next: number) => void] {
  const [width, setWidth] = useState(PANEL_DEFAULT_WIDTH);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setWidth(clampPanelWidth(stored));
    } catch {
      // Private browsing / storage disabled — the default is fine.
    }
  }, []);

  const update = useCallback((next: number) => {
    const clamped = clampPanelWidth(next);
    setWidth(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Non-fatal: the width just won't survive a reload.
    }
  }, []);

  return [width, update];
}
