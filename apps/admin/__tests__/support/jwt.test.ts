import { describe, it, expect, vi, afterEach } from 'vitest';
import { jwtVerify } from 'jose';
import { AppError } from '@propertypro/shared/http';
import { signSupportToken } from '@/lib/support/jwt';

/**
 * Guards the signer half of the forgeable-support-JWT fix.
 *
 * `apps/admin` SIGNS the impersonation token and `apps/web` VERIFIES it. Both
 * used to fall back to a constant checked into the repo whenever
 * NODE_ENV !== 'production'. The signer must now refuse to mint a token at all
 * without a configured secret, in every environment — see the companion suite
 * apps/web/__tests__/support/impersonation.test.ts for the verifier side.
 */

const TEST_SECRET = 'test-support-session-secret-that-is-long-enough-32';
const RETIRED_DEV_SECRET = 'propertypro-local-support-session-secret-2026';

const PAYLOAD = {
  sub: 'user-1',
  act: { sub: 'admin-user-1' },
  community_id: 1,
  session_id: 123,
  scope: 'read_only' as const,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('signSupportToken', () => {
  it('signs a verifiable token when a secret is configured', async () => {
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', TEST_SECRET);

    const token = await signSupportToken(PAYLOAD);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_SECRET), {
      algorithms: ['HS256'],
    });

    expect(payload.sub).toBe('user-1');
    expect(payload.community_id).toBe(1);
    expect(payload.session_id).toBe(123);
    expect(payload.scope).toBe('read_only');
  });

  it('throws a typed 500 when no secret is configured', async () => {
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', '');

    await expect(signSupportToken(PAYLOAD)).rejects.toBeInstanceOf(AppError);
    await expect(signSupportToken(PAYLOAD)).rejects.toMatchObject({
      statusCode: 500,
      code: 'SERVER_MISCONFIGURED',
    });
  });

  it('throws when the configured secret is shorter than 32 characters', async () => {
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', 'too-short');

    await expect(signSupportToken(PAYLOAD)).rejects.toBeInstanceOf(AppError);
  });

  it('does NOT fall back to a dev secret outside production', async () => {
    // The exact condition the retired fallback triggered under. If this ever
    // resolves, admin is minting tokens signed with a publicly-known key.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', '');

    await expect(signSupportToken(PAYLOAD)).rejects.toBeInstanceOf(AppError);
  });

  it('never produces a token verifiable with the retired dev secret', async () => {
    vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', TEST_SECRET);

    const token = await signSupportToken(PAYLOAD);

    await expect(
      jwtVerify(token, new TextEncoder().encode(RETIRED_DEV_SECRET), { algorithms: ['HS256'] }),
    ).rejects.toThrow();
  });
});
