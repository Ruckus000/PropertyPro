"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media-query hook. Returns `false` on the server and on the first
 * client render (so hydration matches), then updates once the effect runs and
 * whenever the query result changes.
 *
 * Duplicated from apps/web/src/hooks/use-media-query.ts (not moved wholesale —
 * that file is still imported directly by apps/web/src/components/pm/site-editor-v3/{Inspector,EditorShell}.tsx,
 * outside this task's scope) so the lifted `Dialog`'s `resizable` prop keeps
 * working without packages/ui depending on apps/web. Zero framework
 * dependency (React + window.matchMedia only), so this stays framework-agnostic.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * `true` at or above the app's `md` breakpoint (768px) — the same threshold the
 * responsive-density CSS and the signature-capture modal switch layout at.
 * Modal resize keys off this so DOM behavior and Tailwind `md:` classes agree.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
