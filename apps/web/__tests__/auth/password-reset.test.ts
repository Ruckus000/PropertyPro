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

  // Meets PASSWORD_POLICY. The previous fixture here was 'new-password-123',
  // which has no uppercase and no special character — it does NOT meet the
  // policy the reset form shows the user, and it passed, because nothing on
  // this path checked. That fixture was the gap in miniature.
  const VALID_PASSWORD = 'New-Password-123!';

  it('updates password successfully with valid session', async () => {
    const result = await updatePassword(VALID_PASSWORD);

    expect(result.success).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith({ password: VALID_PASSWORD });
  });

  it('returns clear message for expired or invalid reset tokens', async () => {
    updateUserMock.mockResolvedValueOnce({
      error: {
        message: 'Token has expired',
      },
    });

    const result = await updatePassword(VALID_PASSWORD);

    expect(result.success).toBe(false);
    expect(result.message).toContain('expired');
  });

  /**
   * The form is not the enforcement point. `updatePasswordAction` is exported
   * from a `'use server'` module, so anyone holding a valid recovery session
   * can call it directly and never run the client's checks.
   */
  it('rejects a password that fails the policy, without calling Supabase', async () => {
    const result = await updatePassword('new-password-123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('uppercase');
    // The decisive assertion: the weak password never reaches the auth provider.
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('states the first unmet rule rather than a generic failure', async () => {
    const result = await updatePassword('short');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/at least 8 characters/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
