/**
 * Tests for ChangePlanForm's two modes.
 *
 * `new` mode is the self-service purchase path that was previously missing
 * entirely: the "Upgrade now" CTA pointed at /settings/billing/change-plan,
 * which redirected any community without an active subscription straight back
 * to /settings/billing — a dead end with no purchase option. The route that
 * mints a Checkout session (POST /api/v1/subscribe) existed but had no caller.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { subscribeMutateMock, changePlanMutateMock, triggerReauthMock, routerPushMock } =
  vi.hoisted(() => ({
    subscribeMutateMock: vi.fn(),
    changePlanMutateMock: vi.fn(),
    triggerReauthMock: vi.fn(),
    routerPushMock: vi.fn(),
  }));

vi.mock('@/hooks/use-subscribe', () => ({
  useSubscribe: () => ({ mutateAsync: subscribeMutateMock }),
}));
vi.mock('@/hooks/use-change-plan', () => ({
  useChangePlan: () => ({ mutateAsync: changePlanMutateMock }),
}));
vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth: triggerReauthMock,
    isOpen: false,
    onCancel: vi.fn(),
    verify: vi.fn(),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { ChangePlanForm } from '@/components/settings/change-plan-form';

const PLANS = [
  { id: 'essentials' as const, label: 'Essentials', monthlyPriceUsd: 199, description: 'Entry' },
  { id: 'professional' as const, label: 'Professional', monthlyPriceUsd: 349, description: 'Full' },
];

function renderForm(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <ChangePlanForm
      communityId={134}
      currentPlan={null}
      currentInterval={null}
      plans={PLANS}
      cancelHref="/settings/billing?communityId=134"
      {...props}
    />,
    { wrapper },
  );
}

/** Select a plan card, then advance through the confirm dialog. */
async function selectAndConfirm(planLabel: string, confirmLabel: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByText(planLabel));
  await user.click(screen.getByRole('button', { name: /continue to payment|review change/i }));
  await user.click(await screen.findByRole('button', { name: confirmLabel }));
}

describe('ChangePlanForm — new subscription mode', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('offers every plan when the community has none', () => {
    renderForm({ mode: 'new' });
    expect(screen.getByText('Essentials')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('redirects to the Stripe checkout URL', async () => {
    subscribeMutateMock.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/c/pay/xyz' });
    renderForm({ mode: 'new' });

    await selectAndConfirm('Essentials', /continue to stripe/i);

    await waitFor(() => {
      expect(subscribeMutateMock).toHaveBeenCalledWith({
        communityId: 134,
        planId: 'essentials',
        billingInterval: 'month',
      });
    });
    await waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/xyz');
    });
  });

  it('does NOT prompt for reauth', async () => {
    // Nothing is charged until the user enters card details on Stripe's own
    // page, so a password prompt guards nothing and only adds funnel friction.
    // (Reauth stays on `change` mode, which bills a card already on file.)
    subscribeMutateMock.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/c/pay/xyz' });
    renderForm({ mode: 'new' });

    await selectAndConfirm('Essentials', /continue to stripe/i);

    await waitFor(() => expect(subscribeMutateMock).toHaveBeenCalled());
    expect(triggerReauthMock).not.toHaveBeenCalled();
  });

  it('surfaces the API error instead of failing silently', async () => {
    subscribeMutateMock.mockRejectedValue(new Error('No Stripe price configured'));
    renderForm({ mode: 'new' });

    await selectAndConfirm('Essentials', /continue to stripe/i);

    expect(await screen.findByRole('alert')).toHaveTextContent('No Stripe price configured');
  });

  it('errors rather than silently no-oping when Stripe returns no URL', async () => {
    subscribeMutateMock.mockResolvedValue({ checkoutUrl: null });
    renderForm({ mode: 'new' });

    await selectAndConfirm('Essentials', /continue to stripe/i);

    expect(await screen.findByRole('alert')).toHaveTextContent(/checkout URL/i);
    expect(window.location.href).toBe('');
  });

  it('carries the annual interval through to the subscribe call', async () => {
    subscribeMutateMock.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/c/pay/xyz' });
    renderForm({ mode: 'new' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /annual/i }));
    await selectAndConfirm('Professional', /continue to stripe/i);

    await waitFor(() => {
      expect(subscribeMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'professional', billingInterval: 'year' }),
      );
    });
  });
});

describe('ChangePlanForm — mode isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes an existing subscriber to change-plan, never to checkout', async () => {
    // Reauth + redirect orchestration for `change` mode is covered in
    // __tests__/settings/change-plan-form.test.tsx; asserted here only to pin
    // that adding `new` mode did not cross the wires.
    triggerReauthMock.mockResolvedValue(true);
    changePlanMutateMock.mockResolvedValue({ ok: true });
    renderForm({ mode: 'change', currentPlan: 'essentials', currentInterval: 'month' });

    await selectAndConfirm('Professional', /confirm change/i);

    await waitFor(() => expect(changePlanMutateMock).toHaveBeenCalled());
    expect(triggerReauthMock).toHaveBeenCalled();
    expect(subscribeMutateMock).not.toHaveBeenCalled();
  });
});
