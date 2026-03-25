import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', 'test-secret-key-at-least-32-chars-long!!');

describe('Impersonation detection', () => {
  let parseImpersonationCookie: typeof import('../../src/lib/support/impersonation').parseImpersonationCookie;

  beforeEach(async () => {
    const mod = await import('../../src/lib/support/impersonation');
    parseImpersonationCookie = mod.parseImpersonationCookie;
  });

  it('returns null when no cookie present', async () => {
    const result = await parseImpersonationCookie(undefined);
    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    const result = await parseImpersonationCookie('garbage.token.value');
    expect(result).toBeNull();
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
