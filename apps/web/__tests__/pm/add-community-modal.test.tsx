/**
 * Unit tests for AddCommunityModal (B5 batch 4B drain).
 *
 * Post-drain: the component delegates both fetches to `use-add-community`
 * (`useBillingGroupPreview` query + `useAddCommunity` mutation). These tests
 * mock that hook and exercise the preview loading/error/success render, the
 * submit → Stripe EmbeddedCheckout handoff, and the preserved error literal.
 *
 * Mirrors the container/presenter test style of
 * `__tests__/contracts/contract-table.test.tsx`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PricingPreview } from '../../src/hooks/use-add-community';

// Radix Select (shadcn) requires ResizeObserver in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stripe module-level loadStripe() + EmbeddedCheckout — no real network/UI.
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="embedded-checkout-provider">{children}</div>
  ),
  EmbeddedCheckout: () => <div data-testid="embedded-checkout" />,
}));

const useBillingGroupPreviewMock = vi.fn();
const mutateMock = vi.fn();
const resetMock = vi.fn();
let mutationState: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};

vi.mock('@/hooks/use-add-community', () => ({
  useBillingGroupPreview: (opts: unknown) => useBillingGroupPreviewMock(opts),
  useAddCommunity: () => ({
    mutate: mutateMock,
    reset: resetMock,
    isPending: mutationState.isPending,
    error: mutationState.error,
  }),
}));

import { AddCommunityModal } from '../../src/components/pm/add-community-modal';

const previewPayload: PricingPreview = {
  previousTier: 'tier1',
  newTier: 'tier2',
  perCommunityBreakdown: [
    { basePriceUsd: 199, discountedPriceUsd: 179, discountPercent: 15 },
  ],
  portfolioMonthlyDeltaUsd: 179,
};

function setPreview(state: { data?: { data: PricingPreview } }) {
  useBillingGroupPreviewMock.mockReturnValue(state);
}

function renderModal(props?: Partial<React.ComponentProps<typeof AddCommunityModal>>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AddCommunityModal
        open
        onClose={props?.onClose ?? vi.fn()}
        billingGroupId={props?.billingGroupId ?? 7}
      />
    </QueryClientProvider>,
  );
}

describe('AddCommunityModal', () => {
  beforeEach(() => {
    useBillingGroupPreviewMock.mockReset();
    mutateMock.mockReset();
    resetMock.mockReset();
    mutationState = { isPending: false, error: null };
  });

  it('renders the form (no pricing preview block) while preview data is absent', () => {
    setPreview({ data: undefined });
    renderModal();

    expect(screen.getByText('Add a Community')).toBeDefined();
    expect(screen.queryByText('Portfolio Pricing')).toBeNull();
  });

  it('renders the pricing preview with discount percent when data resolves', () => {
    setPreview({ data: { data: previewPayload } });
    renderModal();

    expect(screen.getByText('Portfolio Pricing')).toBeDefined();
    expect(screen.getByText('15% volume discount applied')).toBeDefined();
    // previousTier !== newTier → new-tier unlock copy
    expect(
      screen.getByText(
        'Adding this community unlocks a new discount tier for your portfolio.',
      ),
    ).toBeDefined();
  });

  it('omits the new-tier unlock copy when previousTier === newTier', () => {
    setPreview({
      data: {
        data: { ...previewPayload, previousTier: 'same', newTier: 'same' },
      },
    });
    renderModal();

    expect(screen.getByText('Portfolio Pricing')).toBeDefined();
    expect(
      screen.queryByText(
        'Adding this community unlocks a new discount tier for your portfolio.',
      ),
    ).toBeNull();
  });

  it('disables submit until name and subdomain are filled', () => {
    setPreview({ data: undefined });
    renderModal();

    const submitBtn = screen.getByRole('button', { name: 'Continue to Payment' });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Community name'), {
      target: { value: 'Sunset Condos' },
    });
    fireEvent.change(screen.getByLabelText('Subdomain'), {
      target: { value: 'sunset-condos' },
    });

    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits the form via the mutation and renders EmbeddedCheckout on success', () => {
    setPreview({ data: undefined });
    mutateMock.mockImplementation((_form, opts) => {
      opts.onSuccess({ clientSecret: 'cs_test_123' });
    });
    renderModal();

    fireEvent.change(screen.getByLabelText('Community name'), {
      target: { value: 'Sunset Condos' },
    });
    fireEvent.change(screen.getByLabelText('Subdomain'), {
      target: { value: 'sunset-condos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Payment' }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [formArg] = mutateMock.mock.calls[0]!;
    expect(formArg).toMatchObject({
      name: 'Sunset Condos',
      subdomain: 'sunset-condos',
      communityType: 'condo_718',
      planId: 'essentials',
    });
    expect(screen.getByTestId('embedded-checkout')).toBeDefined();
    expect(screen.queryByText('Add a Community')).toBeNull();
  });

  it('shows the exact mutation error literal', () => {
    setPreview({ data: undefined });
    mutationState = {
      isPending: false,
      error: new Error('Checkout creation failed'),
    };
    renderModal();

    expect(screen.getByText('Checkout creation failed')).toBeDefined();
  });

  it('shows the pending submit label while the mutation is in flight', () => {
    setPreview({ data: undefined });
    mutationState = { isPending: true, error: null };
    renderModal();

    expect(screen.getByText('Starting checkout…')).toBeDefined();
  });
});
