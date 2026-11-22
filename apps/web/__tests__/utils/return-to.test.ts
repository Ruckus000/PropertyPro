/**
 * Tests for the returnTo helpers used by the missing-tenant redirect round-trip.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommunityIdToReturnTo,
  resolveSafeReturnTo,
} from '../../src/lib/utils/return-to';
import { resolveReturnTo } from '../../src/lib/utils/auth';

describe('resolveSafeReturnTo', () => {
  it('accepts a plain absolute path', () => {
    expect(resolveSafeReturnTo('/settings')).toBe('/settings');
  });

  it('accepts a path with query string', () => {
    expect(resolveSafeReturnTo('/settings?tab=notifications')).toBe('/settings?tab=notifications');
  });

  it('rejects null / undefined / empty', () => {
    expect(resolveSafeReturnTo(null)).toBeNull();
    expect(resolveSafeReturnTo(undefined)).toBeNull();
    expect(resolveSafeReturnTo('')).toBeNull();
  });

  it('rejects values that do not start with /', () => {
    expect(resolveSafeReturnTo('settings')).toBeNull();
    expect(resolveSafeReturnTo('https://evil.com/x')).toBeNull();
    expect(resolveSafeReturnTo('javascript:alert(1)')).toBeNull();
  });

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(resolveSafeReturnTo('//evil.com/path')).toBeNull();
  });

  it('rejects backslash-after-slash open-redirect attempts (/\\evil.com)', () => {
    expect(resolveSafeReturnTo('/\\evil.com/path')).toBeNull();
  });
});

describe('applyCommunityIdToReturnTo', () => {
  it('appends communityId to a path with no existing query', () => {
    expect(applyCommunityIdToReturnTo('/settings', 282)).toBe('/settings?communityId=282');
  });

  it('preserves other query params and adds communityId', () => {
    expect(applyCommunityIdToReturnTo('/settings?tab=notifications', 282)).toBe(
      '/settings?tab=notifications&communityId=282',
    );
  });

  it('overwrites a stale or attacker-supplied communityId', () => {
    // If the original returnTo carried `?communityId=999`, the picked id wins.
    expect(applyCommunityIdToReturnTo('/settings?communityId=999&tab=notifications', 282)).toBe(
      '/settings?tab=notifications&communityId=282',
    );
  });

  it('strips any returnTo param to prevent infinite loops', () => {
    expect(applyCommunityIdToReturnTo('/dashboard?returnTo=/elsewhere', 282)).toBe(
      '/dashboard?communityId=282',
    );
  });

  it('preserves the URL hash fragment', () => {
    expect(applyCommunityIdToReturnTo('/settings#notifications', 282)).toBe(
      '/settings?communityId=282#notifications',
    );
  });

  it('falls back to /dashboard?communityId=… on a value the URL parser rejects', () => {
    // A bare-bones smoke test for the catch path. URL is permissive, so the
    // input has to be genuinely malformed.
    expect(applyCommunityIdToReturnTo('http://[bad', 282)).toBe('/dashboard?communityId=282');
  });
});

/**
 * Open redirect via URL normalisation. Each payload starts with ONE slash, so
 * a raw-string screen passes it, but `new URL` removes dot segments (`.`,
 * `..`, `%2e`), turns `\` into `/` and strips tabs — collapsing the value into
 * the PATH `//evil.com…`. `applyCommunityIdToReturnTo` serialised only
 * `pathname + search + hash`, so `/select-community?returnTo=/.//evil.com`
 * produced the protocol-relative `//evil.com?communityId=…` as its redirect
 * and card hrefs.
 */
const COLLAPSING_PAYLOADS: Array<[label: string, value: string]> = [
  ['a dot segment', '/.//evil.com'],
  ['a parent segment', '/..//evil.com'],
  ['a segment then a parent segment', '/a/..//evil.com'],
  ['an encoded dot segment', '/%2e//evil.com'],
  ['a dot segment then a backslash', '/./\\evil.com'],
  ['a dot-backslash segment', '/.\\/evil.com'],
  ['a tab the parser strips', '/\t/x//evil.com/p'],
];

describe('returnTo values that normalise off-site', () => {
  it.each(COLLAPSING_PAYLOADS)('resolveSafeReturnTo rejects %s', (_label, value) => {
    expect(resolveSafeReturnTo(value)).toBeNull();
  });

  it.each(COLLAPSING_PAYLOADS)(
    'applyCommunityIdToReturnTo falls back to the dashboard for %s',
    (_label, value) => {
      expect(applyCommunityIdToReturnTo(value, 282)).toBe('/dashboard?communityId=282');
    },
  );

  it.each([...COLLAPSING_PAYLOADS, ['an absolute URL', 'https://evil.com/x'] as [string, string]])(
    'applyCommunityIdToReturnTo never emits a protocol-relative or off-site target for %s',
    (_label, value) => {
      const out = applyCommunityIdToReturnTo(value, 282);
      expect(out).toMatch(/^\/(?![/\\])/);
      expect(new URL(out, 'https://getpropertypro.com').origin).toBe('https://getpropertypro.com');
    },
  );

  it.each([
    ['/dashboard', '/dashboard', '/dashboard?communityId=282'],
    ['/documents?x=1#h', '/documents?x=1#h', '/documents?x=1&communityId=282#h'],
    ['/a/../b', '/a/../b', '/b?communityId=282'],
  ])('control: %s still resolves on-site', (value, safe, applied) => {
    expect(resolveSafeReturnTo(value)).toBe(safe);
    expect(applyCommunityIdToReturnTo(value, 282)).toBe(applied);
  });
});

describe('resolveReturnTo (login / verify-email)', () => {
  it.each(COLLAPSING_PAYLOADS)('falls back for %s', (_label, value) => {
    expect(resolveReturnTo(value)).toBe('/select-community');
    expect(resolveReturnTo(value, true)).toBe('/dashboard');
  });

  it.each(['/dashboard', '/documents?x=1#h', '/a/../b'])('control: keeps %s', (value) => {
    expect(resolveReturnTo(value)).toBe(value);
  });
});
