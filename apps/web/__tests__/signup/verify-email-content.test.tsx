/**
 * Unit tests for VerifyEmailContent (B5 batch #16 drain).
 *
 * Post-B5 split: the component delegates the two auth POSTs to
 * `useConfirmVerification` / `useResendVerification`. These tests mock those
 * hooks (controllable `mutateAsync`) plus `next/navigation`, and drive the
 * poll/cooldown timers with fake timers.
 *
 * Behavior asserted (unchanged from pre-drain):
 * - Poll fires confirm immediately + every POLL_INTERVAL_MS (5000ms)
 * - confirm success (data.success) → router.push to /signup/checkout
 * - resend 409 alreadyVerified → router.push to /signup/checkout
 * - resend 429 → cooldownSeconds set from cooldownRemainingSeconds + countdown
 * - resend success → showResent true then false after 4000ms
 * - resend other non-OK → exact error literal
 * - intervals cleared on unmount
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

const pushMock = vi.fn();
const searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const confirmMutateAsync = vi.fn();
const resendMutateAsync = vi.fn();

vi.mock('@/hooks/use-email-verification', () => ({
  useConfirmVerification: () => ({ mutateAsync: confirmMutateAsync }),
  useResendVerification: () => ({ mutateAsync: resendMutateAsync }),
}));

import { VerifyEmailContent } from '../../src/components/signup/verify-email-content';

function setParams(entries: Record<string, string>) {
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
  for (const [k, v] of Object.entries(entries)) searchParams.set(k, v);
}

beforeEach(() => {
  pushMock.mockReset();
  confirmMutateAsync.mockReset();
  resendMutateAsync.mockReset();
  confirmMutateAsync.mockResolvedValue({ ok: false, status: 400, body: {} });
  resendMutateAsync.mockResolvedValue({
    ok: true,
    status: 200,
    body: { data: { sent: true, cooldownSeconds: 120 } },
  });
  setParams({ signupRequestId: 'sr-1' });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

describe('VerifyEmailContent — poll', () => {
  it('calls confirm immediately on mount with the signupRequestId', async () => {
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(confirmMutateAsync).toHaveBeenCalledWith('sr-1');
  });

  it('fires confirm again after POLL_INTERVAL_MS (5000ms)', async () => {
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(confirmMutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(confirmMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('navigates to /signup/checkout when confirm reports success', async () => {
    confirmMutateAsync.mockResolvedValue({
      ok: true,
      status: 200,
      body: { data: { success: true, signupRequestId: 'sr-1' } },
    });
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledWith(
      '/signup/checkout?signupRequestId=sr-1',
    );
  });

  it('stops polling and clears interval on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('VerifyEmailContent — resend', () => {
  it('409 alreadyVerified → router.push to checkout', async () => {
    resendMutateAsync.mockResolvedValue({
      ok: false,
      status: 409,
      body: { data: { alreadyVerified: true } },
    });
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    const btn = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledWith(
      '/signup/checkout?signupRequestId=sr-1',
    );
  });

  it('429 → cooldown set from cooldownRemainingSeconds and counts down', async () => {
    resendMutateAsync.mockResolvedValue({
      ok: false,
      status: 429,
      body: { error: { cooldownRemainingSeconds: 75 } },
    });
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    const btn = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('1:15')).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('1:14')).toBeDefined();
  });

  it('success → shows resent confirmation then hides it after 4000ms', async () => {
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    const btn = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Verification email resent')).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(screen.queryByText('Verification email resent')).toBeNull();
  });

  it('other non-OK → shows the exact route error message', async () => {
    resendMutateAsync.mockResolvedValue({
      ok: false,
      status: 500,
      body: { error: { message: 'Server exploded' } },
    });
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    const btn = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Server exploded')).toBeDefined();
  });

  it('network failure (mutateAsync rejects) → shows the generic catch literal', async () => {
    resendMutateAsync.mockRejectedValue(new Error('offline'));
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    const btn = screen.getByRole('button', {
      name: /resend verification email/i,
    });
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText('Unable to resend verification email. Please try again.'),
    ).toBeDefined();
  });
});
