import { describe, expect, it } from 'vitest';

import { hostFromUrl, isLoopbackUrl, LOOPBACK_HOSTS } from '../env/loopback';

/**
 * This predicate gates the `/dev/*` login routes, which mint sessions and
 * platform-admin grants. A false positive here is not a styling bug — it is a
 * write against production. The cases below are the ones that actually decide
 * that, not a tour of the happy path.
 */
describe('isLoopbackUrl', () => {
  it('accepts every host on the allowlist', () => {
    for (const host of LOOPBACK_HOSTS) {
      expect(isLoopbackUrl(`http://${host}:54321`), host).toBe(true);
    }
  });

  it('rejects a remote Supabase project', () => {
    expect(isLoopbackUrl('https://vbqobyagjzvlfpfozvmx.supabase.co')).toBe(false);
    expect(isLoopbackUrl('postgresql://postgres@db.vbqobyagjzvlfpfozvmx.supabase.co:5432/postgres')).toBe(
      false,
    );
  });

  it('is not fooled by a loopback host smuggled into the credentials', () => {
    // The reason this predicate strips credentials before reading the host: a
    // substring check for "localhost" reads this URL as local and opens the gate.
    expect(hostFromUrl('postgresql://user:localhost@evil.example.com/db')).toBe('evil.example.com');
    expect(isLoopbackUrl('postgresql://user:localhost@evil.example.com/db')).toBe(false);
    expect(isLoopbackUrl('https://localhost@evil.example.com')).toBe(false);
  });

  it('is not fooled by a loopback host appearing elsewhere in the URL', () => {
    expect(isLoopbackUrl('https://notlocalhost.example.com')).toBe(false);
    expect(isLoopbackUrl('https://example.com/localhost')).toBe(false);
    expect(isLoopbackUrl('https://example.com?host=127.0.0.1')).toBe(false);
  });

  it('treats an absent URL as NOT local', () => {
    // A missing value must never read as safe — that is the direction that
    // fails open.
    expect(isLoopbackUrl(undefined)).toBe(false);
    expect(isLoopbackUrl(null)).toBe(false);
    expect(isLoopbackUrl('')).toBe(false);
  });

  it('ignores scheme and port', () => {
    expect(isLoopbackUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLoopbackUrl('postgresql://postgres:postgres@localhost:5432/db')).toBe(true);
    expect(isLoopbackUrl('https://localhost')).toBe(true);
  });
});
