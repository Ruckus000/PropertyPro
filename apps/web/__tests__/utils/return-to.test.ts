/**
 * Tests for the returnTo helpers used by the missing-tenant redirect round-trip.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommunityIdToReturnTo,
  resolveSafeReturnTo,
} from '../../src/lib/utils/return-to';

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
