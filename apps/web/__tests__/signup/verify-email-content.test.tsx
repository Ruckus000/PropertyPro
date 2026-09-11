/**
 * Unit tests for VerifyEmailContent (B5 batch #16 drain).
 *
 * The component delegates its one auth POST to `useResendVerification`. These
 * tests mock that hook (controllable `mutateAsync`) plus `next/navigation`, and
 * drive the cooldown timer with fake timers.
 *
 * The verification POLL WAS DELETED. It called confirm every 5s for 5 minutes
 * and could not tell "not verified yet" (400) from a 429 or a 500, so any
 * transient fault read as "keep waiting" indefinitely. Everyone who clicks the
 * emailed link is served by `signup-form.tsx` on /signup?verified=1 instead, and
 * the resend 409 below is the manual path for anyone who verified elsewhere.
 *
 * Behavior asserted:
 * - resend 409 alreadyVerified → FULL PAGE navigation to /signup/checkout
 * - resend 429 → cooldownSeconds set from cooldownRemainingSeconds + countdown
 * - resend success → showResent true then false after 4000ms
 * - resend other non-OK → exact error literal
 *
 * The navigation case asserts `window.location.assign`, NOT `router.push`,
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

const resendMutateAsync = vi.fn();

vi.mock('@/hooks/use-email-verification', () => ({
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
  resendMutateAsync.mockReset();
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
