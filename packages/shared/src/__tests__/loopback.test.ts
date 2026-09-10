import { describe, expect, it } from 'vitest';

import {
  hostFromUrl,
  isLoopbackUrl,
  LOOPBACK_HOSTS,
  nonLocalBackendReason,
} from '../env/loopback';

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

  it('is not fooled by a BACKSLASH faking the userinfo delimiter', () => {
    // WHATWG treats `\` as `/` for special schemes, and the Supabase client is
    // WHATWG-based — so the real host here is `evil.com`. With `\` absent from
    // the credential and path character classes, this function stripped
    // `evil.com\@` as userinfo and returned `localhost`, declaring a REMOTE
    // project local. That is the gate opening, the one direction that fails
    // dangerously.
    //
    // Asserted against `new URL(...)` rather than a hardcoded string so the two
    // parsers cannot drift apart silently.
    for (const url of ['https://evil.com\\@localhost/', 'https://evil.com\\@127.0.0.1/']) {
      expect(hostFromUrl(url), url).toBe(new URL(url).host);
      expect(isLoopbackUrl(url), url).toBe(false);
    }
  });

  it('still treats a genuine loopback host with userinfo as local', () => {
    // The backslash fix must not break the ordinary case.
    expect(isLoopbackUrl('postgresql://postgres:postgres@localhost:5432/db')).toBe(true);
    expect(isLoopbackUrl('http://user@127.0.0.1:54321')).toBe(true);
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

/**
 * The `/dev/*` gate. It must name the variable at fault, because the failure it
 * exists to catch is the half-redirected env: one backend local, the other
 * production. A message naming the wrong variable is what shipped before — the
 * old string said "NEXT_PUBLIC_SUPABASE_URL is not a local Supabase instance.
 * This route mints sessions and grants" on a route that mints neither and writes
 * over `DATABASE_URL`.
 */
const LOCAL_SUPABASE = 'http://127.0.0.1:54321';
const LOCAL_DB = 'postgresql://postgres:postgres@localhost:5432/propertypro';
const REMOTE_SUPABASE = 'https://vbqobyagjzvlfpfozvmx.supabase.co';
const REMOTE_DB = 'postgresql://postgres@db.vbqobyagjzvlfpfozvmx.supabase.co:5432/postgres';

describe('nonLocalBackendReason', () => {
  it('returns null only when BOTH backends are loopback', () => {
    expect(
      nonLocalBackendReason({
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE,
        DATABASE_URL: LOCAL_DB,
      }),
    ).toBeNull();
  });

  it('names NEXT_PUBLIC_SUPABASE_URL, and only it, when Supabase is remote', () => {
    const reason = nonLocalBackendReason({
      NEXT_PUBLIC_SUPABASE_URL: REMOTE_SUPABASE,
      DATABASE_URL: LOCAL_DB,
    });
    expect(reason).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(reason).not.toContain('DATABASE_URL');
  });

  it('names DATABASE_URL, and only it, when the database is remote', () => {
    // The gap this function was written for: `supabase start` plus an untouched
    // `.env.local`. A Supabase-only gate passes here and writes production rows.
    const reason = nonLocalBackendReason({
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE,
      DATABASE_URL: REMOTE_DB,
    });
    // Asserted before `toContain` so a predicate that ignores `DATABASE_URL`
    // fails with "expected null not to be null" — the defect — rather than
    // chai's "combination of arguments (null and string) is invalid".
    expect(reason, 'a remote DATABASE_URL did not refuse at all').not.toBeNull();
    expect(reason).toContain('DATABASE_URL');
    expect(reason).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('names both when both are remote', () => {
    const reason = nonLocalBackendReason({
      NEXT_PUBLIC_SUPABASE_URL: REMOTE_SUPABASE,
      DATABASE_URL: REMOTE_DB,
    });
    expect(reason).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(reason).toContain('DATABASE_URL');
  });

  it('never reads an absent value as safe', () => {
    // Each absence independently, and the empty env — the direction that fails
    // open if the filter is written as "is it demonstrably remote".
    const absentSupabase = nonLocalBackendReason({ DATABASE_URL: LOCAL_DB });
    expect(absentSupabase, 'an absent NEXT_PUBLIC_SUPABASE_URL read as safe').not.toBeNull();
    expect(absentSupabase).toContain('NEXT_PUBLIC_SUPABASE_URL');

    const absentDb = nonLocalBackendReason({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE });
    expect(absentDb, 'an absent DATABASE_URL read as safe').not.toBeNull();
    expect(absentDb).toContain('DATABASE_URL');
    expect(
      nonLocalBackendReason({ NEXT_PUBLIC_SUPABASE_URL: '', DATABASE_URL: '' }),
    ).not.toBeNull();
    expect(nonLocalBackendReason({})).not.toBeNull();
  });

  it('does not echo the offending host, which is a production one by definition', () => {
    const reason = nonLocalBackendReason({
      NEXT_PUBLIC_SUPABASE_URL: REMOTE_SUPABASE,
      DATABASE_URL: REMOTE_DB,
    });
    // This string is a 403 response body.
    expect(reason).not.toContain('vbqobyagjzvlfpfozvmx');
  });
});
