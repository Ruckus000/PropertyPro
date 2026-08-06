import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';

/**
 * The real secret this suite configures. `parseImpersonationCookie` reads
 * process.env at CALL time, so individual tests can override it with
 * vi.stubEnv without re-importing the module.
 */
const TEST_SECRET = 'test-support-session-secret-that-is-long-enough-32';

/**
 * The literal that used to live in packages/shared as
 * SUPPORT_SESSION_DEV_SECRET. Both the signer and the verifier fell back to it
 * whenever NODE_ENV !== 'production', so anyone with a checkout could forge an
 * impersonation token for any user in any community. It is reproduced here
 * ONLY as an attacker-controlled value the verifier must now reject.
 */
const RETIRED_DEV_SECRET = 'propertypro-local-support-session-secret-2026';

vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', TEST_SECRET);

const VALID_CLAIMS = {
  act: { sub: 'admin-user-1' },
  community_id: 1,
  session_id: 123,
  scope: 'read_only' as const,
};

async function signWith(secret: string, claims: Record<string, unknown> = VALID_CLAIMS) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(new TextEncoder().encode(secret));
}

describe('Impersonation detection', () => {
  let parseImpersonationCookie: typeof import('../../src/lib/support/impersonation').parseImpersonationCookie;
  let matchesActiveSupportSession: typeof import('../../src/lib/support/impersonation').matchesActiveSupportSession;

  beforeEach(async () => {
    const mod = await import('../../src/lib/support/impersonation');
    parseImpersonationCookie = mod.parseImpersonationCookie;
    matchesActiveSupportSession = mod.matchesActiveSupportSession;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', TEST_SECRET);
  });

  it('returns null when no cookie present', async () => {
    const result = await parseImpersonationCookie(undefined);
    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    const result = await parseImpersonationCookie('garbage.token.value');
    expect(result).toBeNull();
  });

  it('parses a token signed with the configured secret', async () => {
    const result = await parseImpersonationCookie(await signWith(TEST_SECRET));

    expect(result).not.toBeNull();
    expect(result?.sub).toBe('user-1');
    expect(result?.community_id).toBe(1);
    expect(result?.session_id).toBe(123);
    expect(result?.scope).toBe('read_only');
  });

  // --- Fail-closed guards for the retired dev-secret fallback ---------------
  //
  // Each of these passes a STRUCTURALLY PERFECT token — same claims, same
  // algorithm, unexpired — that differs only in the key it was signed with, or
  // in whether a secret is configured at all. If any of them starts returning
  // a payload, the forgeable-JWT hole is back.

  it('rejects a token signed with the retired hard-coded dev secret', async () => {
    const forged = await signWith(RETIRED_DEV_SECRET);

    expect(await parseImpersonationCookie(forged)).toBeNull();
  });

  it('rejects the retired dev secret even outside production', async () => {
    // This is the exact condition the old code fell back under. NODE_ENV must
    // no longer influence verification at all.
    vi.stubEnv('NODE_ENV', 'development');
    const forged = await signWith(RETIRED_DEV_SECRET);

    expect(await parseImpersonationCookie(forged)).toBeNull();
  });

  it('rejects an otherwise-valid token when no secret is configured', async () => {
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', '');
    const token = await signWith(TEST_SECRET);

    expect(await parseImpersonationCookie(token)).toBeNull();
  });

  it('rejects an otherwise-valid token when the configured secret is too short', async () => {
    const shortSecret = 'too-short';
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', shortSecret);
    const token = await signWith(shortSecret);

    expect(await parseImpersonationCookie(token)).toBeNull();
  });

  // THE exploit shape, and the only combination that actually reproduces it.
  //
  // The retired fallback engaged only when the env secret was missing/short
  // AND NODE_ENV !== 'production'. A forged token therefore verifies only in
  // that exact combination — with a real secret configured, even the
  // vulnerable code rejects it. The two cases below are the regression guard;
  // the other tests in this block would all still pass against the old code.
  it('rejects a dev-secret-signed token when NO secret is configured (the exploit)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', '');
    const forged = await signWith(RETIRED_DEV_SECRET);

    expect(await parseImpersonationCookie(forged)).toBeNull();
  });

  it('rejects a dev-secret-signed token when the configured secret is too short', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', 'too-short');
    const forged = await signWith(RETIRED_DEV_SECRET);

    expect(await parseImpersonationCookie(forged)).toBeNull();
  });

  it('matches an active support session row to the parsed token payload', async () => {
    const payload = {
      sub: 'user-1',
      act: { sub: 'admin-user-1' },
      community_id: 1,
      session_id: 123,
      scope: 'read_only' as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const result = matchesActiveSupportSession(payload, {
      id: 123,
      target_user_id: 'user-1',
      community_id: 1,
      access_level: 'read_only',
      ended_at: null,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    expect(result).toBe(true);
  });

  it('rejects ended support session rows even when the JWT is still valid', async () => {
    const payload = {
      sub: 'user-1',
      act: { sub: 'admin-user-1' },
      community_id: 1,
      session_id: 123,
      scope: 'read_only' as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const result = matchesActiveSupportSession(payload, {
      id: 123,
      target_user_id: 'user-1',
      community_id: 1,
      access_level: 'read_only',
      ended_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    expect(result).toBe(false);
  });

  it('blocks mutations in read-only mode', async () => {
    const { isReadOnlyBlocked } = await import('../../src/lib/support/impersonation');
    expect(isReadOnlyBlocked('POST')).toBe(true);
    expect(isReadOnlyBlocked('PUT')).toBe(true);
    expect(isReadOnlyBlocked('PATCH')).toBe(true);
    expect(isReadOnlyBlocked('DELETE')).toBe(true);
    expect(isReadOnlyBlocked('GET')).toBe(false);
    expect(isReadOnlyBlocked('HEAD')).toBe(false);
    expect(isReadOnlyBlocked('OPTIONS')).toBe(false);
  });

  describe('impersonated-identity claims', () => {
    /**
     * Signs with the CONFIGURED secret (stubbed to TEST_SECRET at the top of
     * this file).
     *
     * These tests arrived on main in #905 signing with the retired
     * `SUPPORT_SESSION_DEV_SECRET`, which the verifier used to fall back to
     * whenever `SUPPORT_SESSION_JWT_SECRET` was unset. That constant is gone
     * and there is no fallback, so signing that way now produces a zero-length
     * key. Only the signing key changed — every assertion below is #905's.
     */
    async function signToken(claims: Record<string, unknown>): Promise<string> {
      return signWith(TEST_SECRET, {
        act: { sub: 'admin-user-1' },
        community_id: 1,
        session_id: 123,
        scope: 'read_only',
        ...claims,
      });
    }

    it('round-trips the impersonated name and email', async () => {
      const token = await signToken({
        target_name: 'Olivia Owner',
        target_email: 'owner.one@sunset.local',
      });

      const payload = await parseImpersonationCookie(token);

      expect(payload?.target_name).toBe('Olivia Owner');
      expect(payload?.target_email).toBe('owner.one@sunset.local');
    });

    it('yields null (not undefined) when a token predates the claims', async () => {
      // Tokens signed before these claims existed stay valid until they expire.
      // They must parse, and must report the identity as explicitly absent so
      // middleware clears the headers instead of inheriting the admin's.
      const token = await signToken({});

      const payload = await parseImpersonationCookie(token);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user-1');
      expect(payload?.target_name).toBeNull();
      expect(payload?.target_email).toBeNull();
    });

    it('discards non-string claims rather than trusting them', async () => {
      // These values are rendered as the operator's "who am I acting as"
      // signal, so a malformed claim must degrade to unknown, not to an object
      // or number that some downstream string coercion would happily display.
      const token = await signToken({ target_name: { evil: true }, target_email: 42 });

      const payload = await parseImpersonationCookie(token);

      expect(payload).not.toBeNull();
      expect(payload?.target_name).toBeNull();
      expect(payload?.target_email).toBeNull();
    });
  });
});
