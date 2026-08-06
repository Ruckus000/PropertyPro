import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', '');

describe('Impersonation detection', () => {
  let parseImpersonationCookie: typeof import('../../src/lib/support/impersonation').parseImpersonationCookie;
  let matchesActiveSupportSession: typeof import('../../src/lib/support/impersonation').matchesActiveSupportSession;

  beforeEach(async () => {
    const mod = await import('../../src/lib/support/impersonation');
    parseImpersonationCookie = mod.parseImpersonationCookie;
    matchesActiveSupportSession = mod.matchesActiveSupportSession;
  });

  it('returns null when no cookie present', async () => {
    const result = await parseImpersonationCookie(undefined);
    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    const result = await parseImpersonationCookie('garbage.token.value');
    expect(result).toBeNull();
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
     * Signs with the same dev-secret path the verifier uses when
     * SUPPORT_SESSION_JWT_SECRET is unset (stubbed to '' at the top of file).
     */
    async function signToken(claims: Record<string, unknown>): Promise<string> {
      const { SignJWT } = await import('jose');
      const { SUPPORT_SESSION_DEV_SECRET } = await import('@propertypro/shared');

      return new SignJWT({
        act: { sub: 'admin-user-1' },
        community_id: 1,
        session_id: 123,
        scope: 'read_only',
        ...claims,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('user-1')
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(new TextEncoder().encode(SUPPORT_SESSION_DEV_SECRET));
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
