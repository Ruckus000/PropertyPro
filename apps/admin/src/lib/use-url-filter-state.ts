'use client';

import { useState } from 'react';

/**
 * A filter tab's local state that also FOLLOWS its URL-derived value.
 *
 * `BillingList`, `InboxDashboard` and `TicketQueue` seed their tab from
 * `useSearchParams` and write clicks back with `history.replaceState`. Seeding
 * alone was a one-shot `useState` initializer, and a client navigation to the
 * SAME route does not remount the component: filtered to Canceled on `/billing`,
 * an operator clicking Billing in the rail got a bare `/billing` in the address
 * bar and Canceled still highlighted, over a table still filtered to it.
 *
 * Pass the value the URL resolves to — after validation, never the raw param,
 * so that two spellings of the same fallback (`?status=banana`, no `status`)
 * are one value and changing between them is not a change. Whenever it differs
 * from the last one seen, local state is reset to it, during render: React's
 * "adjust state when a prop changes" pattern, which unlike the effect in
 * `ClientWorkspace` never paints a frame of the stale tab.
 *
 * A tab click still sets local state directly, so it shows at once. Next syncs
 * `replaceState` into `useSearchParams`, so the URL value then catches up to the
 * click and resetting to it changes nothing; where it does not sync, the URL
 * value never moved, and nothing is reset either.
 *
 * Not a `key` remount: `replaceState` changes `useSearchParams`, so keying on
 * the URL would rebuild the whole list on every tab click.
 */
export function useUrlFilterState<T extends string>(fromUrl: T): [T, (next: T) => void] {
  const [value, setValue] = useState(fromUrl);
  const [lastFromUrl, setLastFromUrl] = useState(fromUrl);
  if (fromUrl !== lastFromUrl) {
    setLastFromUrl(fromUrl);
    setValue(fromUrl);
  }
  return [value, setValue];
}
