import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyRequest } from '@/lib/pwa/sw-cache-policy';

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

  it('sw.js mirrors the policy verbatim', async () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    for (const needle of [
      "'/api/'",
      "'/_next/static/'",
      "mode === 'navigate'",
      "method !== 'GET'",
    ]) {
      expect(sw).toContain(needle);
    }
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
