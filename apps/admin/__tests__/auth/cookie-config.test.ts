/**
 * P1-4 / P2-12: real assertions on the admin auth cookie options.
 *
 * The sibling suite `cross-subdomain-session.test.ts` is named after the
 * cookie-domain production incident but mocks `createMiddlewareClient`
 * wholesale, so it never exercises the cookie NAME, DOMAIN or SECURE flag —
 * the regression it is named after could not be caught by it. These are the
 * assertions that actually pin the behaviour.
 *
 * Two invariants, pulling in opposite directions:
 *
 *  - `domain` must stay unset, so the admin session is host-scoped and signing
 *    into the console is distinct from signing into the web app. This one is
 *    INTENDED and a future "fix" that adds a domain would break isolation.
 *  - `secure` must be set in production. This was lost because passing any
 *    cookieOptions object at all REPLACES the shared defaults in
 *    `packages/db/src/supabase/middleware.ts` (`cookieOptions ?? getCookieOptions()`)
 *    rather than merging with them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadOptions() {
  vi.resetModules();
  const mod = await import('@/lib/auth/cookie-config');
  return mod.ADMIN_COOKIE_OPTIONS;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ADMIN_COOKIE_OPTIONS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses a distinct cookie name from the web app', async () => {
    const options = await loadOptions();
    expect(options.name).toBe('sb-admin-auth-token');
  });

  it('sets secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const options = await loadOptions();

    expect(options.secure).toBe(true);
  });

  it('sets secure in production even when NEXT_PUBLIC_COOKIE_DOMAIN is unset', async () => {
    // This is the configuration admin actually runs in. The shared
    // getCookieOptions() helper returns undefined here, so any implementation
    // that merely merges it would leave the cookie without `secure`.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_COOKIE_DOMAIN', '');
    const options = await loadOptions();

    expect(options.secure).toBe(true);
  });

  it('does not force secure outside production (so http://localhost works)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const options = await loadOptions();

    expect(options.secure).toBeUndefined();
  });

  it('never sets a cookie domain — admin sessions stay host-scoped', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_COOKIE_DOMAIN', '.getpropertypro.com');
    const options = await loadOptions();

    // Even with a wildcard domain configured for the web app, the admin cookie
    // must not adopt it: admin login is deliberately NOT web login.
    expect(options.domain).toBeUndefined();
  });
});
