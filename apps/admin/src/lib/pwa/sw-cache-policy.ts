/**
 * What the operator console's service worker is allowed to do with a request.
 *
 * ## Read-only offline, deliberately
 *
 * The console caches enough to READ while offline and nothing more. It never
 * queues a write for later replay. That was an explicit product decision, not
 * an unimplemented phase: a cached screen that accepts a mutation the operator
 * believes landed — a refund, a deletion intervention, a support-access grant —
 * is strictly worse than a screen that says "you are offline". `bypass` on a
 * non-GET means the browser attempts the request itself and fails loudly.
 *
 * ## Why `/api/` is never cached
 *
 * Every `/api/admin/*` response is an authenticated, cross-tenant, service-role
 * payload. Caching one means it can be replayed to whoever holds the browser
 * profile next, and — the case that actually bites — replayed to the SAME
 * operator after their privileges changed. There is no freshness window short
 * enough to make that safe, so the policy is categorical rather than tuned.
 *
 * ## Mirrored, on purpose
 *
 * `apps/admin/public/sw.js` contains a verbatim copy of `classifyRequest`,
 * because a service worker is a raw script served from `public/` and cannot
 * import TypeScript. Twelve duplicated lines beat introducing a bundler for one
 * file. **Change both.** `__tests__/pwa/sw-cache-policy.test.ts` asserts the
 * copy still carries each of the four decisions, so the mirror cannot rot
 * silently — but it checks that the decisions are PRESENT, not that the two
 * functions agree, so keep the function small enough to diff by eye. If it ever
 * grows past that, the answer is to shrink it, not to add a build step.
 */
export type CachePolicy = 'static-cache-first' | 'navigation-network-first' | 'bypass';

/**
 * Path prefixes holding immutable, non-authenticated build output. `/_next/static/`
 * filenames carry a content hash; `/fonts/` and `/icons/` are committed assets.
 */
const STATIC_PREFIXES = ['/_next/static/', '/fonts/', '/icons/'];

export function classifyRequest(
  req: { method: string; url: string; mode: string },
  origin: string,
): CachePolicy {
  // Anything that can change server state: the network, or an honest failure.
  if (req.method !== 'GET') return 'bypass';

  let pathname: string;
  try {
    const url = new URL(req.url);
    // Another origin's caching is that origin's business, and Supabase/Sentry
    // responses are authenticated or telemetry. An unparseable URL is not a
    // request this worker should be guessing about either.
    if (url.origin !== origin) return 'bypass';
    pathname = url.pathname;
  } catch {
    return 'bypass';
  }

  if (pathname.startsWith('/api/')) return 'bypass';

  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return 'static-cache-first';
  }

  // A document request. Network-first, so an online operator never reads a
  // stale console; the cache is only what makes the offline case legible.
  if (req.mode === 'navigate') return 'navigation-network-first';

  // RSC payloads, prefetches, and anything else unrecognised. Bypassing is the
  // safe default: an uncached request is slow, a wrongly-cached one is wrong.
  return 'bypass';
}
