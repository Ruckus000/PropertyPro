'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media-query hook. Returns `false` on the server and on the first
 * client render (so hydration matches), then updates once the effect runs and
 * whenever the query result changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * `true` at or above the app's `md` breakpoint (768px) — the same threshold the
 * responsive-density CSS and the signature-capture modal switch layout at.
 * Modal resize keys off this so DOM behavior and Tailwind `md:` classes agree.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
