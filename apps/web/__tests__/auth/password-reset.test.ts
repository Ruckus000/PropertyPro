import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resetPasswordForEmailMock, updateUserMock, createServerClientMock } = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
  updateUserMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/server', () => ({
  createServerClient: createServerClientMock,
}));

import {
  requestPasswordReset,
  updatePassword,
  _testInternals,
} from '../../src/lib/auth/password-reset';
import {
  checkPasswordResetRateLimit,
  resetPasswordResetRateLimitStore,
} from '../../src/lib/rate-limit/password-reset-limiter';

describe('p1-21 password reset flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPasswordResetRateLimitStore();
    vi.useRealTimers();

    createServerClientMock.mockResolvedValue({
      auth: {
        resetPasswordForEmail: resetPasswordForEmailMock,
        updateUser: updateUserMock,
      },
    });

    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
  });

  it('allows only 3 reset requests per email per hour', () => {
    const first = checkPasswordResetRateLimit('resident@example.com');
    const second = checkPasswordResetRateLimit('resident@example.com');
    const third = checkPasswordResetRateLimit('resident@example.com');
    const fourth = checkPasswordResetRateLimit('resident@example.com');

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('returns the same generic message for successful forgot-password requests', async () => {
    const result = await requestPasswordReset('resident@example.com');

    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(1);
  });

  it('returns generic success message even when supabase call throws', async () => {
    resetPasswordForEmailMock.mockRejectedValueOnce(new Error('network error'));

    const result = await requestPasswordReset('resident@example.com');

    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
  });

  it('returns rate-limit error after 3 requests', async () => {
    await requestPasswordReset('resident@example.com');
    await requestPasswordReset('resident@example.com');
    await requestPasswordReset('resident@example.com');
    const result = await requestPasswordReset('resident@example.com');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Too many reset requests');
    expect(result.rateLimitResult?.allowed).toBe(false);
  });

  it('enforces minimum response delay on successful forgot-password requests', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const pending = requestPasswordReset('resident@example.com');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(_testInternals.MIN_RESPONSE_MS);
    const result = await pending;

    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(_testInternals.MIN_RESPONSE_MS);
    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
  });

  it('enforces minimum response delay when supabase call throws', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    resetPasswordForEmailMock.mockRejectedValueOnce(new Error('network failure'));

    const pending = requestPasswordReset('resident@example.com');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(_testInternals.MIN_RESPONSE_MS);
    const result = await pending;

    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(_testInternals.MIN_RESPONSE_MS);
    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
  });

  it('enforces minimum response delay on rate-limited requests', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    checkPasswordResetRateLimit('resident@example.com');
    checkPasswordResetRateLimit('resident@example.com');
    checkPasswordResetRateLimit('resident@example.com');

    const pending = requestPasswordReset('resident@example.com');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(_testInternals.MIN_RESPONSE_MS);
    const result = await pending;

    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(_testInternals.MIN_RESPONSE_MS);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Too many reset requests');
  });

  it('updates password successfully with valid session', async () => {
    const result = await updatePassword('new-password-123');

    expect(result.success).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-password-123' });
  });

  it('returns clear message for expired or invalid reset tokens', async () => {
    updateUserMock.mockResolvedValueOnce({
      error: {
        message: 'Token has expired',
      },
    });

    const result = await updatePassword('new-password-123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('expired');
  });
});
