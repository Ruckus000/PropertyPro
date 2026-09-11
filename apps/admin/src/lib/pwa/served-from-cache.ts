/**
 * A module-level store holding the one fact the service worker reports to the
 * page: "what you are reading came out of the cache, and it was put there at
 * <time>".
 *
 * ## Why a store and not React context
 *
 * The writer (`ServiceWorkerRegistration`) is mounted by the ROOT layout and the
 * reader (`OfflineBanner`) is deep inside the console shell. Connecting them
 * with context means wrapping the root layout's `children` in a client
 * provider, which changes how every page in both route groups is composed — a
 * large structural change to carry one nullable string. A module singleton in
 * the shared client bundle carries it with no structural change at all.
 *
 * Import-time pure: this module allocates a Set and a variable and touches no
 * browser API, so importing it from a server component is harmless.
 */
let cachedAt: string | null = null;
const listeners = new Set<() => void>();

export function setServedFromCache(stamp: string | null): void {
  if (stamp === cachedAt) return;
  cachedAt = stamp;
  for (const listener of listeners) listener();
}

export function subscribeServedFromCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getServedFromCache(): string | null {
  return cachedAt;
}

/**
 * The server never sees a cached response — it IS the origin — so the
 * server-rendered pass must read `null`. `useSyncExternalStore` requires this
 * to be a stable reference, which a bare `null` is.
 */
export function getServedFromCacheServerSnapshot(): null {
  return null;
}

/** Test-only: drop state that would otherwise leak between cases. */
export function resetServedFromCache(): void {
  cachedAt = null;
  listeners.clear();
}
