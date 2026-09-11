/**
 * The verification-return effect must confirm EXACTLY ONCE.
 *
 * `signup-form.tsx` depended on the whole object returned by `useMutation`,
 * which React Query recreates every render because it carries isPending/status/
 * data. That made `confirmVerification` a new function each render, which
 * re-fired the effect, which set state, which re-rendered — an unbounded loop.
 *
 * Observed in production 2026-09-11: the page sat on "Confirming your email
 * verification..." forever while the database had already recorded
 * `email_verified`, because every pass reset the state to `confirming`. It also
 * POSTed to /api/v1/auth/confirm-verification on each pass, which is the more
 * likely explanation for that day's 429 than any user clicking repeatedly.
 *
 * THE REAL HOOK IS USED HERE, deliberately. Mocking `useConfirmEmailVerification`
 * would hand the component a stable function and hide the entire defect — the
 * bug lives in React Query's return identity, not in our code's logic. Only
 * `fetch` is stubbed.
 */
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SignupForm } from '../../src/components/signup/signup-form';

const fetchMock = vi.fn();

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function confirmCalls(): number {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes('/api/v1/auth/confirm-verification'),
  ).length;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { success: true, signupRequestId: 'req-1' } }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SignupForm — return from the verification link', () => {
  it('confirms exactly once and settles on the confirmed state', async () => {
    render(<SignupForm verificationReturn initialSignupRequestId="req-1" />);

    await waitFor(() => {
      expect(screen.getByText(/email verified/i)).toBeInTheDocument();
    });

    // The loop's signature was an ever-growing call count. One render pass, one
    // POST.
    expect(confirmCalls()).toBe(1);

    // And it must STAY settled — a later render must not re-arm the effect.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confirmCalls()).toBe(1);
    expect(screen.queryByText(/confirming your email verification/i)).toBeNull();
  });

  it('does not confirm at all without verificationReturn', async () => {
    render(<SignupForm initialSignupRequestId="req-1" />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confirmCalls()).toBe(0);
  });

  it('surfaces the error state once when confirmation fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Too many requests' } }),
    });

    render(<SignupForm verificationReturn initialSignupRequestId="req-1" />);

    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
    });
    // The failure path must not retry itself into the same loop.
    expect(confirmCalls()).toBe(1);
  });
});
