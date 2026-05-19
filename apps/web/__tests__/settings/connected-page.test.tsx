/**
 * Unit tests for the Stripe Connect OAuth callback page
 * (settings/payments/connected/page.tsx).
 *
 * Post-B5 split: the page delegates the
 * `POST /api/v1/stripe/connect/complete` call to
 * `useCompleteStripeConnect`. The page still owns the orchestration:
 * searchParams reads, base64url `state` decode + communityId validation,
 * the `exchanged` ref one-shot guard, success state, the 2000ms
 * setTimeout → router.push redirect, and the catch → errorMsg fallback.
 *
 * These tests mock the hook + next/navigation and assert the page's
 * observable behavior is preserved exactly, including the one-shot dedupe.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { useRouterMock, useSearchParamsMock, mutateAsyncMock } = vi.hoisted(
  () => ({
    useRouterMock: vi.fn(),
    useSearchParamsMock: vi.fn(),
    mutateAsyncMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/hooks/use-stripe-connect-complete', () => ({
  useCompleteStripeConnect: () => ({ mutateAsync: mutateAsyncMock }),
}));

import StripeConnectCallbackPage from '../../src/app/(authenticated)/settings/payments/connected/page';

const pushMock = vi.fn();
const backMock = vi.fn();

/** Build the base64url state the page expects: outer.p === JSON.stringify({ communityId }). */
function makeState(communityId: unknown): string {
  const outer = { p: JSON.stringify({ communityId }) };
  return Buffer.from(JSON.stringify(outer), 'utf-8').toString('base64url');
}

function setSearchParams(params: Record<string, string>) {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(params));
}

beforeEach(() => {
  vi.useRealTimers();
  pushMock.mockReset();
  backMock.mockReset();
  mutateAsyncMock.mockReset();
  useRouterMock.mockReturnValue({ push: pushMock, back: backMock });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StripeConnectCallbackPage', () => {
  it('shows the missing-params error and does NOT call the mutation when code is absent', () => {
    setSearchParams({ state: makeState(42) });

    render(<StripeConnectCallbackPage />);

    expect(
      screen.getByText(
        'Missing authorization code or state parameter from Stripe.',
      ),
    ).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('shows the missing-params error when state is absent', () => {
    setSearchParams({ code: 'ac_123' });

    render(<StripeConnectCallbackPage />);

    expect(
      screen.getByText(
        'Missing authorization code or state parameter from Stripe.',
      ),
    ).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('shows the invalid-state error for an undecodable state and does NOT call the mutation', () => {
    setSearchParams({ code: 'ac_123', state: 'not-valid-base64url-json' });

    render(<StripeConnectCallbackPage />);

    expect(
      screen.getByText('Invalid state parameter. Please try connecting again.'),
    ).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('shows the invalid-state error when communityId is not a number', () => {
    setSearchParams({ code: 'ac_123', state: makeState('nope') });

    render(<StripeConnectCallbackPage />);

    expect(
      screen.getByText('Invalid state parameter. Please try connecting again.'),
    ).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('calls mutateAsync exactly once with the exact payload on valid params', async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const state = makeState(42);
    setSearchParams({ code: 'ac_123', state });

    render(<StripeConnectCallbackPage />);

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      communityId: 42,
      code: 'ac_123',
      state,
    });
  });

  it('does not fire the mutation twice across a rerender (one-shot exchanged ref)', async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    const state = makeState(42);
    setSearchParams({ code: 'ac_123', state });

    const { rerender } = render(<StripeConnectCallbackPage />);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));

    rerender(<StripeConnectCallbackPage />);
    rerender(<StripeConnectCallbackPage />);

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('on success shows the success UI and redirects after a 2000ms delay', async () => {
    vi.useFakeTimers();
    mutateAsyncMock.mockResolvedValue(undefined);
    setSearchParams({ code: 'ac_123', state: makeState(42) });

    render(<StripeConnectCallbackPage />);

    // Flush the resolved mutateAsync promise.
    await vi.waitFor(() =>
      expect(screen.getByText('Stripe Connected!')).toBeDefined(),
    );

    expect(pushMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(pushMock).toHaveBeenCalledWith(
      '/settings/payments?communityId=42',
    );
  });

  it('shows the thrown Error message when the mutation rejects with an Error', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Stripe rejected the code'));
    setSearchParams({ code: 'ac_123', state: makeState(42) });

    render(<StripeConnectCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText('Stripe rejected the code')).toBeDefined(),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to "Something went wrong" when the rejection is not an Error', async () => {
    mutateAsyncMock.mockRejectedValue('boom');
    setSearchParams({ code: 'ac_123', state: makeState(42) });

    render(<StripeConnectCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText('Something went wrong')).toBeDefined(),
    );
  });
});
