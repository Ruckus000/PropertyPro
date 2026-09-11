import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NAVIGATION_MAX_AGE_MS,
  classifyRequest,
  isCachedDocumentFresh,
} from '@/lib/pwa/sw-cache-policy';

const o = 'https://admin.getpropertypro.com';

describe('classifyRequest', () => {
  it('never touches mutations or APIs', () => {
    expect(classifyRequest({ method: 'POST', url: `${o}/api/admin/tickets`, mode: 'cors' }, o)).toBe(
      'bypass',
    );
    expect(
      classifyRequest({ method: 'GET', url: `${o}/api/admin/shell/signals`, mode: 'cors' }, o),
    ).toBe('bypass');
  });

  // The scope decision this whole worker is built around: read-only offline.
  // A cached page must never be able to make a mutation look like it landed,
  // so EVERY non-GET bypasses regardless of what it is aimed at — including a
  // navigation-mode POST (a form submission), which is the one shape that
  // could otherwise fall through to the navigation branch below.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('bypasses %s even on a cacheable path', (method) => {
    expect(classifyRequest({ method, url: `${o}/dashboard`, mode: 'navigate' }, o)).toBe('bypass');
    expect(classifyRequest({ method, url: `${o}/_next/static/chunks/a.js`, mode: 'cors' }, o)).toBe(
      'bypass',
    );
  });

  // An authenticated, cross-tenant, service-role payload. Never cached, on any
  // path under /api/ and in any request mode.
  //
  // NOTE on what these `cors` cases prove: deleting the `/api/` guard leaves
  // them GREEN, because an unrecognised same-origin GET already falls through
  // to the closing `bypass`. They are defence in depth, and saying so here is
  // the honest version — the case BELOW is the one that measures the guard.
  it.each([
    '/api/admin/shell/signals',
    '/api/admin/preferences',
    '/api/health',
    '/api/admin/clients/1/support-access',
  ])('bypasses GET %s', (path) => {
    expect(classifyRequest({ method: 'GET', url: `${o}${path}`, mode: 'cors' }, o)).toBe('bypass');
  });

  // The case the `/api/` guard uniquely catches, and the one that would
  // actually write an authenticated payload to disk: a DOCUMENT request for an
  // API URL. An operator pasting `/api/admin/...` into the address bar, or a
  // redirect landing there, is `mode: 'navigate'` — which without the guard is
  // classified `navigation-network-first` and cached like a page, to be
  // replayed later to whoever holds the browser profile, or to the same
  // operator after their privileges changed.
  it.each([
    '/api/admin/shell/signals',
    '/api/admin/clients/1/support-access',
  ])('bypasses a navigation to %s rather than caching the payload as a page', (path) => {
    expect(classifyRequest({ method: 'GET', url: `${o}${path}`, mode: 'navigate' }, o)).toBe(
      'bypass',
    );
  });

  it('caches static assets first and navigations network-first', () => {
    expect(
      classifyRequest({ method: 'GET', url: `${o}/_next/static/chunks/a.js`, mode: 'no-cors' }, o),
    ).toBe('static-cache-first');
    expect(classifyRequest({ method: 'GET', url: `${o}/dashboard`, mode: 'navigate' }, o)).toBe(
      'navigation-network-first',
    );
  });

  it.each(['/_next/static/css/app.css', '/fonts/inter.woff2', '/icons/icon-192.png'])(
    'treats %s as immutable build output',
    (path) => {
      expect(classifyRequest({ method: 'GET', url: `${o}${path}`, mode: 'no-cors' }, o)).toBe(
        'static-cache-first',
      );
    },
  );

  it('bypasses other origins', () => {
    expect(classifyRequest({ method: 'GET', url: 'https://api.stripe.com/v1', mode: 'cors' }, o)).toBe(
      'bypass',
    );
  });

  // Supabase auth and Sentry ingest both leave the page as same-METHOD GETs to
  // another origin. `/_next/static/` on someone else's host must not be enough
  // to earn a cache entry either — the origin check has to come first.
  it('bypasses a cross-origin URL that looks like a static asset', () => {
    expect(
      classifyRequest(
        { method: 'GET', url: 'https://evil.example/_next/static/chunks/a.js', mode: 'no-cors' },
        o,
      ),
    ).toBe('bypass');
  });

  it('bypasses an unparseable URL rather than guessing', () => {
    expect(classifyRequest({ method: 'GET', url: 'not a url', mode: 'no-cors' }, o)).toBe('bypass');
  });

  // RSC payloads and prefetches: same-origin GETs on a page path, but not
  // documents. Caching them would serve a stale authenticated payload into a
  // client-side navigation.
  it('bypasses a same-origin non-navigation page request', () => {
    expect(classifyRequest({ method: 'GET', url: `${o}/dashboard`, mode: 'cors' }, o)).toBe(
      'bypass',
    );
  });

  // A thread detail renders the full body of somebody's correspondence with us.
  // It is the one document no freshness window makes acceptable to leave on a
  // shared device, so it is fetched live and NEVER written — which is a
  // different decision from `bypass`: the worker still answers, with the offline
  // page rather than the browser's own error screen.
  it.each(['/inbox/123', '/inbox/123/', '/inbox/abc?from=tray'])(
    'never stores %s, the document that carries support-email bodies',
    (path) => {
      expect(classifyRequest({ method: 'GET', url: `${o}${path}`, mode: 'navigate' }, o)).toBe(
        'navigation-network-only',
      );
    },
  );

  // The inbox LIST is deliberately still cacheable: it carries subjects and
  // participants, which the tray on every other console page already carries,
  // so excluding it would buy nothing and remove the offline case.
  it('still caches the inbox list, which carries no message bodies', () => {
    expect(classifyRequest({ method: 'GET', url: `${o}/inbox`, mode: 'navigate' }, o)).toBe(
      'navigation-network-first',
    );
  });

  it('sw.js mirrors the policy verbatim', async () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    for (const needle of [
      "'/api/'",
      "'/_next/static/'",
      "mode === 'navigate'",
      "method !== 'GET'",
      'NEVER_STORE_PATTERNS',
      "'navigation-network-only'",
      'NAVIGATION_MAX_AGE_MS',
      'isCachedDocumentFresh',
    ]) {
      expect(sw).toContain(needle);
    }
  });

  // The TTL is only real if it is honoured on READ: an entry written an hour ago
  // is already on disk, and a device that has been offline the whole time never
  // gets a write-side chance to drop it.
  it('sw.js expires a stored document on read and deletes it', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/isCachedDocumentFresh\(cachedAt, Date\.now\(\)\)/);
    expect(sw).toMatch(/await cache\.delete\(request\)/);
  });

  // `store` false is what makes `navigation-network-only` mean anything; without
  // it the branch above would classify correctly and cache anyway.
  it('sw.js only stores a navigation when the policy is network-FIRST', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/handleNavigation\(event\.request, policy === 'navigation-network-first'\)/);
    expect(sw).toMatch(/if \(store\) await putStamped\(cache, request, response\);/);
  });
});

describe('isCachedDocumentFresh', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const stamp = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('serves a document stored inside the window', () => {
    expect(isCachedDocumentFresh(stamp(0), now)).toBe(true);
    expect(isCachedDocumentFresh(stamp(NAVIGATION_MAX_AGE_MS - 1000), now)).toBe(true);
  });

  it('refuses one stored at or past the window', () => {
    expect(isCachedDocumentFresh(stamp(NAVIGATION_MAX_AGE_MS), now)).toBe(false);
    expect(isCachedDocumentFresh(stamp(NAVIGATION_MAX_AGE_MS * 24), now)).toBe(false);
  });

  // Fails CLOSED. An entry with no usable stamp is from an older worker or was
  // hand-crafted; neither is a thing to trust with an authenticated page. This
  // is the case that would otherwise make the whole TTL a no-op.
  it.each([null, '', 'not a date'])('refuses an entry stamped %p', (cachedAt) => {
    expect(isCachedDocumentFresh(cachedAt, now)).toBe(false);
  });

  it('refuses a stamp in the future rather than treating it as eternally fresh', () => {
    expect(isCachedDocumentFresh(new Date(now + 60_000).toISOString(), now)).toBe(false);
  });

  // The mirror comment is the only thing telling a future reader that editing
  // one copy is half a change. Asserting it names BOTH directions is what
  // stops the comment decaying into a one-way pointer.
  it('sw.js names the module it mirrors, and says to change both', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    expect(sw).toContain('sw-cache-policy.ts');
    expect(sw).toMatch(/CHANGE BOTH/i);
  });

  it('sw.js never calls respondWith for a bypassed request', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/if\s*\(policy === 'bypass'\)\s*return;/);
  });
});
