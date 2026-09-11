'use client';

/**
 * Registers `/sw.js`. Renders nothing.
 *
 * Mounted by the ROOT layout rather than the console layout, so the manifest,
 * the icons and the worker are all in place on the login page too — which is
 * where a browser decides the site is installable, and where an operator who
 * has been signed out lands.
 *
 * ## Three deliberate conditions
 *
 * 1. **Production only.** A worker in `next dev` caches chunks Turbopack is
 *    about to invalidate, and the resulting "my edit did nothing" is a very
 *    expensive class of confusion. It also survives in the browser after the
 *    dev server stops.
 * 2. **After `load`.** Registration kicks off an install that fetches
 *    `/offline`, and doing that during the critical path competes with the
 *    page's own requests for bandwidth and main-thread time. Nothing here is
 *    needed for the first paint — so it waits for one.
 * 3. **Failures are swallowed.** An unsupported browser, a private window with
 *    storage disabled, or an enterprise policy blocking workers must all leave
 *    an entirely working console. Offline reading is the enhancement; the
 *    console is the product.
 */
import { useEffect } from 'react';
import { setServedFromCache } from '@/lib/pwa/served-from-cache';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; cachedAt?: unknown } | null;
      if (!data || data.type !== 'served-from-cache') return;
      setServedFromCache(typeof data.cachedAt === 'string' ? data.cachedAt : null);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // See condition 3 above.
      });
    };

    // `load` has usually already fired by the time an effect runs on a
    // client-side navigation, and a listener added afterwards never fires — so
    // the state is checked rather than assumed.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
