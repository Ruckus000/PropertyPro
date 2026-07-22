'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAVIGATION_START_EVENT } from '@/lib/navigation-progress-event';

/** Delay before the bar appears, so instant navigations never flash it. */
const SHOW_DELAY_MS = 150;
/** Interval between trickle increments while a navigation is pending. */
const TRICKLE_INTERVAL_MS = 200;
/** The trickle asymptotically approaches this fraction and waits there. */
const TRICKLE_CEILING = 0.85;
/** Fade-out duration after completion (must match the CSS duration below). */
const COMPLETE_FADE_MS = 250;
/** Same-URL navigations never change pathname/searchParams; force-hide. */
const SAFETY_TIMEOUT_MS = 15_000;

type BarState = 'idle' | 'pending' | 'complete';

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<BarState>('idle');
  const [progress, setProgress] = useState(0);

  const pendingRef = useRef(false);
  const shownRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);
  const trickleRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    for (const id of timeoutsRef.current) {
      window.clearTimeout(id);
    }
    timeoutsRef.current = [];
    if (trickleRef.current !== null) {
      window.clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!pendingRef.current) {
      return;
    }
    pendingRef.current = false;
    clearTimers();
    if (!shownRef.current) {
      // Navigation resolved before the show delay — never render the bar.
      setState('idle');
      setProgress(0);
      return;
    }
    shownRef.current = false;
    setProgress(1);
    setState('complete');
    timeoutsRef.current.push(
      window.setTimeout(() => {
        setState('idle');
        setProgress(0);
      }, COMPLETE_FADE_MS),
    );
  }, [clearTimers]);

  useEffect(() => {
    const start = () => {
      if (pendingRef.current) {
        return;
      }
      pendingRef.current = true;
      shownRef.current = false;
      clearTimers();
      timeoutsRef.current.push(
        window.setTimeout(() => {
          if (!pendingRef.current) {
            return;
          }
          shownRef.current = true;
          setState('pending');
          const prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches;
          if (prefersReducedMotion) {
            // No trickle animation — a static bar that fades on completion.
            setProgress(TRICKLE_CEILING);
            return;
          }
          setProgress(0.08);
          trickleRef.current = window.setInterval(() => {
            setProgress((current) => current + (TRICKLE_CEILING - current) * 0.12);
          }, TRICKLE_INTERVAL_MS);
        }, SHOW_DELAY_MS),
      );
      timeoutsRef.current.push(window.setTimeout(finish, SAFETY_TIMEOUT_MS));
    };

    window.addEventListener(NAVIGATION_START_EVENT, start);
    return () => {
      window.removeEventListener(NAVIGATION_START_EVENT, start);
      clearTimers();
    };
  }, [clearTimers, finish]);

  const routeKey = `${pathname}?${searchParams?.toString() ?? ''}`;
  const lastRouteKeyRef = useRef(routeKey);
  useEffect(() => {
    if (lastRouteKeyRef.current === routeKey) {
      return;
    }
    lastRouteKeyRef.current = routeKey;
    finish();
  }, [routeKey, finish]);

  if (state === 'idle') {
    return null;
  }

  return (
    // The loading.tsx skeletons already announce loading state to screen
    // readers; this bar is purely visual, so it is hidden from the a11y tree.
    <div
      aria-hidden="true"
      data-testid="navigation-progress"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <div
        className="h-0.5 transition-all duration-200 ease-out motion-reduce:transition-opacity"
        style={{
          width: `${progress * 100}%`,
          opacity: state === 'complete' ? 0 : 1,
          background: 'var(--interactive-primary)',
        }}
      />
    </div>
  );
}

/**
 * Global top navigation progress bar. Mount once in the root layout.
 *
 * Driven by the `pp:navigation-start` event dispatched from
 * `onRouterTransitionStart` in instrumentation-client.ts, so it covers every
 * App Router transition (sidebar links, breadcrumbs, command palette
 * router.push, back/forward) without patching Link or the router.
 */
export function NavigationProgress() {
  return (
    // useSearchParams requires a Suspense boundary during prerendering.
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
