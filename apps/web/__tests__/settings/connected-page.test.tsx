/**
 * Unit tests for the Stripe Connect onboarding return page
 * (settings/payments/connected/page.tsx).
 *
 * Stripe's hosted onboarding sends the admin back here with only
 * `?communityId=`, whether or not they finished. The page owns: reading and
 * validating that id, the `exchanged` ref one-shot guard, telling a finished
 * setup apart from an unfinished one, the 2000ms redirect, and the error text.
 * The `POST /api/v1/stripe/connect/complete` call is delegated to
 * `useCompleteStripeConnect`, which is mocked here.
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
  const MISSING = 'This link is missing its community. Please start again from payment settings.';
  const synced = (onboardingComplete: boolean) => ({
    stripeAccountId: 'acct_123',
    onboardingComplete,
    chargesEnabled: onboardingComplete,
    payoutsEnabled: onboardingComplete,
  });

  it('shows the missing-community error and does NOT call the mutation when communityId is absent', () => {
    setSearchParams({});

    render(<StripeConnectCallbackPage />);

    expect(screen.getByText(MISSING)).toBeDefined();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it.each(['nope', '0', '-3', '4.5'])(
    'shows the missing-community error for communityId=%s',
    (communityId) => {
      setSearchParams({ communityId });

      render(<StripeConnectCallbackPage />);

      expect(screen.getByText(MISSING)).toBeDefined();
      expect(mutateAsyncMock).not.toHaveBeenCalled();
    },
  );

  it('calls mutateAsync exactly once with the exact payload on valid params', async () => {
    mutateAsyncMock.mockResolvedValue(synced(true));
    setSearchParams({ communityId: '42' });

    render(<StripeConnectCallbackPage />);

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(mutateAsyncMock).toHaveBeenCalledWith({ communityId: 42 });
  });

  it('does not fire the mutation twice across a rerender (one-shot exchanged ref)', async () => {
    mutateAsyncMock.mockResolvedValue(synced(true));
    setSearchParams({ communityId: '42' });

    const { rerender } = render(<StripeConnectCallbackPage />);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));

    rerender(<StripeConnectCallbackPage />);
    rerender(<StripeConnectCallbackPage />);

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('on a finished setup shows the success UI and redirects after a 2000ms delay', async () => {
    vi.useFakeTimers();
    mutateAsyncMock.mockResolvedValue(synced(true));
    setSearchParams({ communityId: '42' });

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

  it('on an unfinished setup says so instead of claiming success, then redirects', async () => {
    vi.useFakeTimers();
    mutateAsyncMock.mockResolvedValue(synced(false));
    setSearchParams({ communityId: '42' });

    render(<StripeConnectCallbackPage />);

    await vi.waitFor(() =>
      expect(screen.getByText("Stripe setup isn't finished")).toBeDefined(),
    );
    expect(screen.queryByText('Stripe Connected!')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(pushMock).toHaveBeenCalledWith('/settings/payments?communityId=42');
  });

  it('when Stripe is still verifying, says so instead of claiming success, then redirects', async () => {
    vi.useFakeTimers();
    mutateAsyncMock.mockResolvedValue({ ...synced(true), chargesEnabled: false });
    setSearchParams({ communityId: '42' });

    render(<StripeConnectCallbackPage />);

    await vi.waitFor(() =>
      expect(screen.getByText('Stripe is reviewing your account')).toBeDefined(),
    );
    expect(screen.queryByText('Stripe Connected!')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(pushMock).toHaveBeenCalledWith('/settings/payments?communityId=42');
  });

  it('shows the thrown Error message when the mutation rejects with an Error', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Stripe Connect account is not configured for this community'));
    setSearchParams({ communityId: '42' });

    render(<StripeConnectCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText('Stripe Connect account is not configured for this community')).toBeDefined(),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to "Something went wrong" when the rejection is not an Error', async () => {
    mutateAsyncMock.mockRejectedValue('boom');
    setSearchParams({ communityId: '42' });

    render(<StripeConnectCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText('Something went wrong')).toBeDefined(),
    );
  });
});
