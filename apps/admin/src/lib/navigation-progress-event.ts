/**
 * Navigation-progress event contract (admin copy).
 *
 * `onRouterTransitionStart` (apps/admin/src/instrumentation-client.ts)
 * dispatches this event synchronously when an App Router transition begins.
 * The `NavigationProgress` component listens for it to drive the global top
 * progress bar. Deliberately duplicated from apps/web — packages/ui avoids
 * depending on next/navigation, so each app owns its tiny copy.
 */
export const NAVIGATION_START_EVENT = 'pp:navigation-start';

export function dispatchNavigationStart(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
