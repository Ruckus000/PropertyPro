'use client';

/**
 * A view switcher whose state lives in the URL.
 *
 * Third instance of this mechanism — `meetings-page-shell.tsx` wrote it, then
 * `AdminPaymentsTabs.tsx` copied it verbatim — so it is extracted here rather
 * than written a third time. What is extracted is the mechanism, not the
 * presentation: the three call sites diverge entirely in what their triggers
 * render, and a shared component would need a render prop to cover that.
 *
 * Four things repeat, and each is individually easy to get wrong:
 *
 *   - read from `useSearchParams()` with NO `useState` mirror, so the URL is
 *     the single source of truth and a back/forward keeps up;
 *   - coerce unknown values to a default rather than rendering nothing;
 *   - preserve the other query params — dropping `communityId` bounces the
 *     user to `/select-community`;
 *   - `replace`, not `push`, so Back leaves the page instead of walking every
 *     view the user glanced at.
 *
 * `window.history.replaceState`, not `router.replace`: Next syncs native
 * history calls into `useSearchParams`, and the router call re-rendered the
 * whole force-dynamic page on the server for a switch only the client reads.
 * Use this only where the server page does not render from the param.
 */

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function useUrlView<T extends string>(
  param: string,
  coerce: (raw: string | null) => T,
): { view: T; setView: (next: string) => void } {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = coerce(searchParams.get(param));

  const setView = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(param, coerce(next));
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [coerce, param, pathname, searchParams],
  );

  return { view, setView };
}
