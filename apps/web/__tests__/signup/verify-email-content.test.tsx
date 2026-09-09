/**
 * Unit tests for VerifyEmailContent (B5 batch #16 drain).
 *
 * Post-B5 split: the component delegates the two auth POSTs to
 * `useConfirmVerification` / `useResendVerification`. These tests mock those
 * hooks (controllable `mutateAsync`) plus `next/navigation`, and drive the
 * poll/cooldown timers with fake timers.
 *
 * Behavior asserted:
 * - Poll fires confirm immediately + every POLL_INTERVAL_MS (5000ms)
 * - confirm success (data.success) → FULL PAGE navigation to /signup/checkout
 * - resend 409 alreadyVerified → FULL PAGE navigation to /signup/checkout
 * - resend 429 → cooldownSeconds set from cooldownRemainingSeconds + countdown
 * - resend success → showResent true then false after 4000ms
 * - resend other non-OK → exact error literal
 * - intervals cleared on unmount
 *
 * The two navigation cases assert `window.location.assign`, NOT `router.push`,
 * and that is the point of them rather than an implementation detail. Checkout
 * invokes a Server Action on mount, and Server Action ids are build-coupled, so
 * a client-side navigation would hand it the ids from whatever bundle THIS page
 * loaded with — stale after any deploy, and it fails silently. `useRouter` is
 * deliberately absent from the `next/navigation` mock below, so reintroducing
 * `router.push` fails loudly instead of passing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

const assignMock = vi.fn();
const searchParams = new URLSearchParams();

// No `useRouter`: the component must not navigate through the client router.
vi.mock('next/navigation', () => ({
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

let originalLocation: string & Location;

beforeEach(() => {
  assignMock.mockReset();
  originalLocation = window.location as string & Location;
  // @ts-expect-error — replace for assertion
  delete window.location;
  // @ts-expect-error — minimal stub
  window.location = { assign: assignMock };
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
  window.location = originalLocation;
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

  it('confirm success → full page navigation to checkout, not router.push', async () => {
    confirmMutateAsync.mockResolvedValue({
      ok: true,
      status: 200,
      body: { data: { success: true, signupRequestId: 'sr-1' } },
    });
    render(<VerifyEmailContent />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignMock).toHaveBeenCalledWith(
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
  it('409 alreadyVerified → full page navigation to checkout, not router.push', async () => {
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
    expect(assignMock).toHaveBeenCalledWith(
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
