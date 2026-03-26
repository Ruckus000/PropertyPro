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
});
