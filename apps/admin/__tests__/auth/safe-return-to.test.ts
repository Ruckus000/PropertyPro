/**
 * `?returnTo=` is fed straight into `router.push` after a successful login.
 *
 * The original guard was three prefix rules — `startsWith('/')` and
 * `!startsWith('//')` — which rejected `//evil.com` but not `/\evil.com`.
 * Browsers normalise backslashes to forward slashes in the authority position,
 * so that IS a protocol-relative URL: the operator signs in and lands on an
 * attacker's host, having just typed their credentials.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '@/app/auth/login/page';

const FALLBACK = '/clients';

describe('safeReturnTo', () => {
  it('keeps a normal in-app path, with query and hash', () => {
    expect(safeReturnTo('/clients/42?tab=members#top')).toBe('/clients/42?tab=members#top');
  });

  it('falls back for a missing or non-absolute value', () => {
    expect(safeReturnTo(null)).toBe(FALLBACK);
    expect(safeReturnTo('')).toBe(FALLBACK);
    expect(safeReturnTo('clients')).toBe(FALLBACK);
    expect(safeReturnTo('https://evil.com')).toBe(FALLBACK);
  });

  it('rejects every protocol-relative shape, including the backslash variants', () => {
    for (const value of [
      '//evil.com',
      '/\\evil.com',
      '/\\/evil.com',
      '\\\\evil.com',
      '//evil.com/path?a=b',
    ]) {
      expect(safeReturnTo(value), value).toBe(FALLBACK);
    }
  });

  // Not a bypass, and worth pinning so nobody "hardens" it into one. `%2F` is
  // NOT decoded into an authority separator: `/%2F%2Fevil.com` resolves to
  // `<origin>/%2F%2Fevil.com`, a path on our own host. Rejecting it would be
  // superstition, and adding a raw-string blocklist for it would be the same
  // guessing game the prefix rules lost.
  it('treats a percent-encoded authority as the same-origin path it is', () => {
    expect(safeReturnTo('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
  });

  // Dot segments resolve against the origin, so they cannot escape it — but the
  // returned value must be the RESOLVED path, not the raw one.
  it('normalises dot segments rather than passing them through', () => {
    expect(safeReturnTo('/a/../clients')).toBe('/clients');
  });
});
