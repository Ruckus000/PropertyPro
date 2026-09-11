/**
 * PropertyPro Operator Console — service worker.
 *
 * Scope: install + READ-ONLY offline. This worker never queues a write for
 * later replay and never caches an authenticated API response. It DOES cache
 * authenticated console DOCUMENTS — that is what read-only offline is — and
 * that exception is bounded three ways: the cache is cleared on sign-out
 * (`../src/lib/pwa/clear-offline-cache.ts`), a stored document expires after
 * `NAVIGATION_MAX_AGE_MS` and is deleted on read, and the thread detail is
 * never stored at all. See `../src/lib/pwa/sw-cache-policy.ts` for all of it.
 *
 * Served straight from `public/`, so it is a plain script: no TypeScript, no
 * imports, no build step. That is why `classifyRequest` below is duplicated.
 */

/* eslint-env serviceworker */

const CACHE = 'ppro-admin-v1';
const OFFLINE_URL = '/offline';

/** Header this worker stamps on every cached response, so a served-from-cache
 *  page can tell the operator how old what they are reading is. */
const CACHED_AT_HEADER = 'x-ppro-cached-at';

// ---------------------------------------------------------------------------
// mirror of apps/admin/src/lib/pwa/sw-cache-policy.ts — and that file is the
// mirror of this one. A service worker cannot import TypeScript, so the policy
// is written twice ON PURPOSE. CHANGE BOTH; `__tests__/pwa/sw-cache-policy.test.ts`
// reads this file and asserts each decision below is still present here.
// ---------------------------------------------------------------------------
const STATIC_PREFIXES = ['/_next/static/', '/fonts/', '/icons/'];

// Documents that must never be written to disk. `/inbox/<threadId>` renders the
// full body of somebody's correspondence with us — see the policy module.
const NEVER_STORE_PATTERNS = [/^\/inbox\/[^/]+/];

// How long a stored console document may still be served offline: one hour,
// matching the Supabase access-token lifetime. Checked on READ, so an entry that
// aged out while the device was offline is discarded rather than served.
const NAVIGATION_MAX_AGE_MS = 60 * 60 * 1000;

function isCachedDocumentFresh(cachedAt, now) {
  if (!cachedAt) return false;
  const stored = Date.parse(cachedAt);
  if (!Number.isFinite(stored)) return false;
  if (stored > now) return false;
  return now - stored < NAVIGATION_MAX_AGE_MS;
}

function classifyRequest(req, origin) {
  if (req.method !== 'GET') return 'bypass';

  let pathname;
  try {
    const url = new URL(req.url);
    if (url.origin !== origin) return 'bypass';
    pathname = url.pathname;
  } catch {
    return 'bypass';
  }

  if (pathname.startsWith('/api/')) return 'bypass';

  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return 'static-cache-first';
  }

  if (req.mode === 'navigate') {
    return NEVER_STORE_PATTERNS.some((pattern) => pattern.test(pathname))
      ? 'navigation-network-only'
      : 'navigation-network-first';
  }

  return 'bypass';
}
// --------------------------- end mirrored block ----------------------------

/**
 * Store a response under `request`, stamped with the time it was stored.
 *
 * Three responses are refused, each for a reason that is a real bug otherwise:
 * - not `ok` — caching a 404 or a 500 makes the offline console show the error
 *   forever, long after the server recovered;
 * - `redirected` — replaying a followed redirect to a navigation whose redirect
 *   mode is not `follow` makes the browser fail the whole navigation with a
 *   network error. The admin middleware 307s to `/auth/login`, so this is the
 *   ordinary case for an expired session, not a corner;
 * - not `basic` — an opaque or CORS response has nothing readable to serve.
 */
async function putStamped(cache, request, response) {
  if (!response.ok || response.redirected || response.type !== 'basic') return;

  const headers = new Headers(response.headers);
  const now = new Date();
  // `Date` is preserved when the server sent one — it is the more truthful
  // "when was this generated" — and synthesised when it did not.
  if (!headers.has('date')) headers.set('date', now.toUTCString());
  headers.set(CACHED_AT_HEADER, now.toISOString());

  const body = await response.clone().arrayBuffer();
  await cache.put(
    request,
    new Response(body, { status: response.status, statusText: response.statusText, headers }),
  );
}

function cachedAtOf(response) {
  if (!response) return null;
  const stamp = response.headers.get(CACHED_AT_HEADER);
  if (stamp) return stamp;
  const date = response.headers.get('date');
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Tell every open console window that what it is looking at came out of the
 * cache, and when it was put there. `OfflineBanner` reads this.
 *
 * Best-effort by construction: a FULL RELOAD while offline is served before the
 * new document exists as a client, so this message has no one to reach and is
 * dropped. That case is covered instead by the banner's fallback — the cached
 * HTML carries the signal payload's own `generatedAt`, which is the same fact
 * measured a moment earlier. What this message does buy is the client-side
 * navigation case, where the window is already open and its `generatedAt` is
 * from the still-live session rather than from the cached page.
 */
async function announceServedFromCache(url, cachedAt) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'served-from-cache', url, cachedAt });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Only the offline fallback is precached. Precaching the console's own
      // routes would mean fetching authenticated HTML at install time — which
      // on the login page (where registration also runs) is a redirect, and on
      // a console page is a snapshot nobody asked for.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // A newly installed worker should take over at the next navigation
      // rather than waiting for every tab to close; the console is a
      // single-origin app with no cross-version client contract.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

async function handleStatic(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  await putStamped(cache, request, response);
  return response;
}

/**
 * Network-first for a console document.
 *
 * `store` is false for `navigation-network-only` — the thread detail, which
 * renders full support-email bodies and must not exist on disk at all. Such a
 * request is fetched live, never written, and falls to `/offline` rather than to
 * a stale copy.
 *
 * A stored hit is served only while `isCachedDocumentFresh` allows it. An
 * expired entry is DELETED rather than merely skipped: leaving it would keep an
 * authenticated document on disk for a page the operator may never open again.
 */
async function handleNavigation(request, store) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (store) await putStamped(cache, request, response);
    return response;
  } catch {
    const hit = store ? await cache.match(request) : undefined;
    if (hit) {
      const cachedAt = cachedAtOf(hit);
      if (isCachedDocumentFresh(cachedAt, Date.now())) {
        // Do not block the response on telling the window about it.
        void announceServedFromCache(request.url, cachedAt);
        return hit;
      }
      await cache.delete(request);
    }
    const fallback = await cache.match(OFFLINE_URL);
    if (fallback) return fallback;
    // Nothing cached and no network. Answering with a real response beats
    // letting the navigation fail with the browser's own error page, which
    // says nothing about this being an offline-capable app.
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<p>You are offline. Reconnect and reload to open the console.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

// ---------------------------------------------------------------------------
// Web push
//
// The payload is written by `src/lib/server/push.ts` (`PushPayload`): a JSON
// object of `{ title, body, url, fingerprint }`. Keep the two in step.
// ---------------------------------------------------------------------------

const PUSH_FALLBACK = {
  title: 'PropertyPro console',
  body: 'Something needs your attention.',
  url: '/',
  fingerprint: '',
};

/**
 * Read the payload defensively.
 *
 * `event.data` can be absent entirely — a push service may wake a worker with
 * no body at all, and some browsers do so to test the subscription. `.json()`
 * also throws on anything that is not JSON. Either way a notification MUST
 * still be shown: the subscription declared `userVisibleOnly`, and a push that
 * shows nothing counts against that promise and can cost the subscription.
 */
function readPushPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (!data || typeof data !== 'object') return PUSH_FALLBACK;
    return {
      title: typeof data.title === 'string' && data.title ? data.title : PUSH_FALLBACK.title,
      body: typeof data.body === 'string' && data.body ? data.body : PUSH_FALLBACK.body,
      // Same-origin paths only. The click handler navigates to this, and an
      // absolute URL from a payload would make a notification a redirect to
      // anywhere. Anything that is not a rooted path falls back to the console.
      url:
        typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
          ? data.url
          : PUSH_FALLBACK.url,
      // Optional: a notification minted by an older worker has no fingerprint,
      // and the tag falls back to `url` below.
      fingerprint: typeof data.fingerprint === 'string' ? data.fingerprint : '',
    };
  } catch {
    return PUSH_FALLBACK;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapse repeats of the same ALERT rather than stacking them: the
      // dispatch ledger already prevents re-sending, but a re-subscribed second
      // device can legitimately produce a duplicate.
      //
      // The fingerprint, NOT the url. `url` is the destination: three scheduled
      // deletions all point at `/deletion-requests` and every orphan past-due
      // row points at `/billing`, so tagging on it threw away two of every three
      // such alerts — the console decided they were each worth sending and the
      // worker silently collapsed them. Falls back to `url` for a payload minted
      // by an older worker, which is the pre-fingerprint behaviour.
      tag: payload.fingerprint || payload.url,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        // Without this, a window that is open but not yet controlled by this
        // worker is invisible here and a second one is opened on top of it.
        includeUncontrolled: true,
      });
      // Resolved AND re-checked against our origin. The push handler already
      // refuses anything that is not a rooted path, so this is the second lock
      // on the same door — but it is the layer that runs on a notification
      // created by an OLDER version of this worker, which is the one case the
      // push-side guard cannot cover.
      let target = new URL('/', self.location.origin).href;
      try {
        const resolved = new URL(url, self.location.origin);
        if (resolved.origin === self.location.origin) target = resolved.href;
      } catch {
        // keep the root fallback
      }

      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      // Otherwise reuse any open console window rather than opening a third:
      // focus it and navigate, falling back to a new window when navigation is
      // not permitted.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              return await client.navigate(target);
            } catch {
              break;
            }
          }
          break;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const policy = classifyRequest(event.request, self.location.origin);

  // `bypass` deliberately does NOT call respondWith. The browser then performs
  // the request exactly as if no worker were installed — which keeps every
  // mutation, every `/api/` call and every cross-origin request on the real
  // network, with the real error when it fails.
  if (policy === 'bypass') return;

  if (policy === 'static-cache-first') {
    event.respondWith(handleStatic(event.request));
    return;
  }

  event.respondWith(handleNavigation(event.request, policy === 'navigation-network-first'));
});
