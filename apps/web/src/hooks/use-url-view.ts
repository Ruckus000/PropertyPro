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
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useUrlView<T extends string>(
  param: string,
  coerce: (raw: string | null) => T,
): { view: T; setView: (next: string) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = coerce(searchParams.get(param));

  const setView = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(param, coerce(next));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [coerce, param, pathname, router, searchParams],
  );

  return { view, setView };
}
