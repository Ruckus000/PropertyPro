/**
 * `resolveAdminOrigin` — the one place a client-supplied header becomes a URL
 * the server will fetch.
 *
 * The Health board's `Admin` row probes `${origin}/api/health`, and the origin
 * is derived from `Host`/`X-Forwarded-Host` unless `ADMIN_APP_ORIGIN` is set.
 * Both of those headers are attacker-supplied, so the cases below are mostly
 * about what must NOT become an origin. `undefined` is a safe answer — the probe
 * reports `unknown`; a wrong origin is not.
 *
 * The header fallback is DEVELOPMENT-ONLY, which is the last describe block.
 * These cases run under the vitest default `NODE_ENV`, which is `test`, so they
 * exercise the fallback path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAdminOrigin } from '@/lib/server/request-origin';

const headers = (init: Record<string, string>) => new Headers(init);
const ORIGINAL = process.env.ADMIN_APP_ORIGIN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_APP_ORIGIN;
  else process.env.ADMIN_APP_ORIGIN = ORIGINAL;
  vi.unstubAllEnvs();
});

describe('resolveAdminOrigin', () => {
  it('prefers ADMIN_APP_ORIGIN over any header', () => {
    process.env.ADMIN_APP_ORIGIN = 'https://admin.getpropertypro.com';
    expect(resolveAdminOrigin(headers({ host: 'evil.test' }))).toBe(
      'https://admin.getpropertypro.com',
    );
  });

  it('falls back to the request host over https', () => {
    expect(resolveAdminOrigin(headers({ host: 'admin.getpropertypro.com' }))).toBe(
      'https://admin.getpropertypro.com',
    );
  });

  it('uses http for loopback, where there is no TLS', () => {
    expect(resolveAdminOrigin(headers({ host: 'localhost:3001' }))).toBe('http://localhost:3001');
  });

  it('honours x-forwarded-proto', () => {
    expect(
      resolveAdminOrigin(headers({ host: 'localhost:3001', 'x-forwarded-proto': 'https' })),
    ).toBe('https://localhost:3001');
  });

  it('prefers x-forwarded-host, which is what a proxy sets', () => {
    expect(
      resolveAdminOrigin(headers({ host: 'internal:3001', 'x-forwarded-host': 'admin.test' })),
    ).toBe('https://admin.test');
  });

  it.each([
    ['userinfo', 'evil@admin.test'],
    ['a path', 'admin.test/../evil'],
    ['a scheme', 'https://evil.test'],
    ['a protocol-relative host', '//evil.test'],
    ['a forwarded-host list', 'admin.test,evil.test'],
    ['a space', 'admin.test evil.test'],
    ['an empty host', ''],
    ['a leading dot', '.evil.test'],
    ['a query', 'admin.test?x=1'],
  ])('refuses %s rather than fetching it', (_label, host) => {
    expect(resolveAdminOrigin(headers({ host }))).toBeUndefined();
  });

  it('returns undefined with no headers at all', () => {
    expect(resolveAdminOrigin(new Headers())).toBeUndefined();
  });

  it('ignores a malformed ADMIN_APP_ORIGIN rather than trusting its protocol', () => {
    process.env.ADMIN_APP_ORIGIN = 'file:///etc/passwd';
    expect(resolveAdminOrigin(headers({ host: 'admin.test' }))).toBe('https://admin.test');
  });
});

describe('in production, a header cannot choose the target at all', () => {
  it('refuses the header fallback and reports nothing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ADMIN_APP_ORIGIN;

    // A well-formed host that would be accepted anywhere else. In production the
    // answer is `undefined` — the Admin row says "unknown" and names the
    // variable, which is better than probing a host a caller nominated. The
    // shape check stops a different PATH; only this stops a different HOST.
    expect(resolveAdminOrigin(headers({ host: '127.0.0.1:9200' }))).toBeUndefined();
    expect(resolveAdminOrigin(headers({ 'x-forwarded-host': 'admin.test' }))).toBeUndefined();
  });

  it('still uses ADMIN_APP_ORIGIN, which is how production is meant to be set up', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.ADMIN_APP_ORIGIN = 'https://admin.getpropertypro.com';

    expect(resolveAdminOrigin(headers({ host: 'evil.test' }))).toBe(
      'https://admin.getpropertypro.com',
    );
  });
});
