/**
 * Navigation-progress event contract.
 *
 * `onRouterTransitionStart` (apps/web/src/instrumentation-client.ts) dispatches
 * this event synchronously when an App Router transition begins (push /
 * replace / back / forward). The `NavigationProgress` component listens for it
 * to drive the global top progress bar. Route completion is detected via
 * `usePathname()`/`useSearchParams()` changes, so no completion event exists.
 */
export const NAVIGATION_START_EVENT = 'pp:navigation-start';

export function dispatchNavigationStart(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
