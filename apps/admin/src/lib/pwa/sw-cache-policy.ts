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
 * ## Navigation DOCUMENTS are the deliberate exception, and it is bounded
 *
 * The paragraph above was originally written about `/api/` alone, and that was
 * the gap: a console document is rendered by the same service-role reads, so a
 * cached `/dashboard` carries the notification tray's correspondent names and a
 * cached `/clients/44` carries that client's billing. Read-only offline cannot
 * exist without storing SOME authenticated document — there is nothing else to
 * serve — so the exception is stated here rather than implied, and it is
 * bounded three ways:
 *
 * 1. **Cleared on sign-out.** `lib/pwa/clear-offline-cache.ts` drops every cache
 *    before `RailFooter` navigates away. Sign-out is the one moment the operator
 *    has told us this device should stop holding their session's data.
 * 2. **Expired on read.** A stored document is served only while
 *    `isCachedDocumentFresh` says so; past that it is deleted and the offline
 *    page is shown instead. See `NAVIGATION_MAX_AGE_MS` for the value and why.
 * 3. **Never stored at all for `NEVER_STORE_PATTERNS`.** A thread detail renders
 *    full support-email bodies — the most sensitive content the console has —
 *    so it is `navigation-network-only`: fetched live, never written, and the
 *    offline page rather than a stale copy when there is no network.
 *
 * What remains uncovered, stated plainly: a session that EXPIRES without a
 * sign-out leaves documents readable until the TTL runs out. That is the window
 * `NAVIGATION_MAX_AGE_MS` exists to bound, not to close.
 *
 * ## Mirrored, on purpose
 *
 * `apps/admin/public/sw.js` contains a verbatim copy of `classifyRequest` and of
 * the freshness check, because a service worker is a raw script served from
 * `public/` and cannot import TypeScript. A few duplicated lines beat
 * introducing a bundler for one file. **Change both.**
 * `__tests__/pwa/sw-cache-policy.test.ts` asserts the copy still carries each of
 * the decisions, so the mirror cannot rot silently — but it checks that the
 * decisions are PRESENT, not that the two functions agree, so keep the functions
 * small enough to diff by eye. If they ever grow past that, the answer is to
 * shrink them, not to add a build step.
 */
export type CachePolicy =
  | 'static-cache-first'
  | 'navigation-network-first'
  | 'navigation-network-only'
  | 'bypass';

/**
 * Path prefixes holding immutable, non-authenticated build output. `/_next/static/`
 * filenames carry a content hash; `/fonts/` and `/icons/` are committed assets.
 */
const STATIC_PREFIXES = ['/_next/static/', '/fonts/', '/icons/'];

/**
 * Documents that must never be written to disk, however briefly.
 *
 * `/inbox/<threadId>` server-renders the SANITIZED HTML BODY of every message on
 * a support thread (`app/(console)/inbox/[threadId]/page.tsx`) — the full text
 * of somebody's correspondence with us, and the one thing in this console that
 * no freshness window makes acceptable to leave on a shared device. The inbox
 * LIST is not matched: it carries subjects and participants, which the tray on
 * every other console page already carries, so excluding it would buy nothing
 * while removing the offline case this feature exists for.
 */
const NEVER_STORE_PATTERNS = [/^\/inbox\/[^/]+/];

/**
 * How long a cached console document may still be served offline.
 *
 * One hour, chosen to match the console's Supabase ACCESS-token lifetime. A
 * cached document that outlives the token it was rendered under is exactly the
 * "replayed to the same operator after their privileges changed" case this
 * module refuses for `/api/`; tying the two together means the document stops
 * being readable at the same moment the credential that produced it would have
 * had to be refreshed.
 *
 * It is deliberately a READ-side check, not just a write-side one: an entry
 * written an hour ago is already on disk, so expiring it on read is what makes
 * the bound real for a device that has been offline the whole time.
 */
export const NAVIGATION_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * May this stored document still be served?
 *
 * Fails CLOSED: a response with no usable timestamp is treated as stale rather
 * than as fresh. `putStamped` always writes one, so an entry without it is
 * either from an older worker or hand-crafted, and neither is a thing to trust
 * with an authenticated page.
 */
export function isCachedDocumentFresh(cachedAt: string | null, now: number): boolean {
  if (!cachedAt) return false;
  const stored = Date.parse(cachedAt);
  if (!Number.isFinite(stored)) return false;
  // A future stamp means a clock moved, not that the entry is eternally fresh.
  if (stored > now) return false;
  return now - stored < NAVIGATION_MAX_AGE_MS;
}

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
  if (req.mode === 'navigate') {
    return NEVER_STORE_PATTERNS.some((pattern) => pattern.test(pathname))
      ? 'navigation-network-only'
      : 'navigation-network-first';
  }

  // RSC payloads, prefetches, and anything else unrecognised. Bypassing is the
  // safe default: an uncached request is slow, a wrongly-cached one is wrong.
  return 'bypass';
}
