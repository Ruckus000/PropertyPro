/**
 * Unit tests for ConnectStatus (B5 batch #1, drain #22).
 *
 * Post-drain: status query + onboarding mutation live in `use-stripe-connect`.
 * Tests mock that hook; the component is rendered inside a QueryClientProvider
 * because it still calls `useQueryClient()` for cache invalidation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConnectStatusData } from '../../src/hooks/use-stripe-connect';

const useStatusMock = vi.fn();
const onboardMutateMock = vi.fn();
const useOnboardMock = vi.fn();

vi.mock('@/hooks/use-stripe-connect', () => ({
  useStripeConnectStatus: () => useStatusMock(),
  useStartStripeOnboarding: () => useOnboardMock(),
  stripeConnectStatusKey: (id: number) => ['stripe-connect-status', id],
}));

import { ConnectStatus } from '../../src/components/finance/connect-status';

function setStatus(state: {
  data?: ConnectStatusData;
  isPending?: boolean;
  isError?: boolean;
}) {
  useStatusMock.mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
  });
}

function renderConnect() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectStatus communityId={42} />
    </QueryClientProvider>,
  );
}

const fullyConnected: ConnectStatusData = {
  connected: true,
  stripeAccountId: 'acct_9',
  onboardingComplete: true,
  chargesEnabled: true,
  payoutsEnabled: true,
};

describe('ConnectStatus', () => {
  beforeEach(() => {
    useStatusMock.mockReset();
    useOnboardMock.mockReset();
    onboardMutateMock.mockReset();
    useOnboardMock.mockReturnValue({ mutate: onboardMutateMock, isPending: false });
  });

  it('shows the error banner literal on status error', () => {
    setStatus({ isError: true });
    renderConnect();
    expect(
      screen.getByText('Failed to load payment connection status.'),
    ).toBeDefined();
  });

  it('renders the fully-connected state', () => {
    setStatus({ data: fullyConnected });
    renderConnect();
    expect(screen.getByText('Stripe Connected')).toBeDefined();
    expect(
      screen.getByText('Account acct_9 is active. Payments and payouts are enabled.'),
    ).toBeDefined();
  });

  it('renders the not-connected state and starts onboarding on click', () => {
    setStatus({
      data: {
        connected: false,
        stripeAccountId: null,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      },
    });
    renderConnect();
    expect(screen.getByText('Connect Bank Account')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Stripe' }));
    expect(onboardMutateMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('renders the setup-incomplete state', () => {
    setStatus({
      data: {
        connected: true,
        stripeAccountId: 'acct_1',
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      },
    });
    renderConnect();
    expect(screen.getByText('Setup Incomplete')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Resume Setup' })).toBeDefined();
  });
});
