/**
 * The `requestPasswordReset` Server Action carries its own per-IP limit.
 *
 * A Server Action POSTs to the page it is bundled on. On `/auth/forgot-password`
 * that is the middleware's auth tier, but the same action is bundled on
 * `/mobile/settings/security`, which middleware classes as a `page` request — so
 * the distributed 10/min/IP auth limit never applied there, only the
 * per-instance, per-email limiter inside the core. The action now consumes
 * `pwreset:ip:<ip>` through the house distributed limiter itself.
 *
 * The distributed (Redis) half is mocked to "not configured", so
 * `consumeKeyedRateLimit` falls back to the real in-memory limiter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.hoisted(() => vi.fn());
const requestCoreMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/middleware/distributed-rate-limiter', () => ({
  checkDistributedRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/auth/password-reset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/password-reset')>()),
  requestPasswordReset: requestCoreMock,
}));

import { requestPasswordReset } from '@/lib/auth/actions';
import { PASSWORD_RESET_RATE_LIMITED_MESSAGE } from '@/lib/auth/password-reset';

const SENT = {
  success: true,
  message: 'If an account with that email exists, you will receive a password reset link shortly.',
};

function fromIp(ip: string): void {
  headersMock.mockResolvedValue(new Headers({ 'x-real-ip': ip }));
}

describe('requestPasswordReset per-IP limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestCoreMock.mockResolvedValue(SENT);
  });

  it('eleventh reset in a minute from one IP is refused', async () => {
    fromIp('203.0.113.11');
    for (let i = 0; i < 10; i++) {
      // Different addresses each time: the per-email limiter cannot be what stops it.
      await expect(requestPasswordReset(`user${i}@example.com`)).resolves.toEqual(SENT);
    }
    expect(requestCoreMock).toHaveBeenCalledTimes(10);

    const refused = await requestPasswordReset('user10@example.com');
    expect(refused).toEqual({ success: false, message: PASSWORD_RESET_RATE_LIMITED_MESSAGE });
    // Refused before any reset email could be sent.
    expect(requestCoreMock).toHaveBeenCalledTimes(10);
  });

  it('the refusal is the same message the per-email limit gives, whatever the address', async () => {
    fromIp('203.0.113.12');
    for (let i = 0; i < 10; i++) await requestPasswordReset(`a${i}@example.com`);
    const known = await requestPasswordReset('pm.admin@sunset.local');
    const unknown = await requestPasswordReset('nobody-at-all@example.com');
    expect(known).toEqual({ success: false, message: PASSWORD_RESET_RATE_LIMITED_MESSAGE });
    expect(known).toEqual(unknown);
  });

  it('another IP is unaffected', async () => {
    fromIp('203.0.113.13');
    for (let i = 0; i < 11; i++) await requestPasswordReset(`b${i}@example.com`);
    fromIp('203.0.113.14');
    await expect(requestPasswordReset('c@example.com')).resolves.toEqual(SENT);
  });
});
