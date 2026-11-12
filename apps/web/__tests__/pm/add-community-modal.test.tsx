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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PricingPreview } from '../../src/hooks/use-add-community';

// Radix Select (shadcn) requires ResizeObserver and pointer capture in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

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
const accessMock = vi.fn();
const triggerReauthMock = vi.fn();
const mutateMock = vi.fn();
const resetMock = vi.fn();
let mutationState: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};

vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth: triggerReauthMock,
    isOpen: false,
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
    verify: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-add-community', () => ({
  useAddCommunityAccess: (enabled: boolean) => accessMock(enabled),
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
      <AddCommunityModal open onClose={props?.onClose ?? vi.fn()} returnFocusTo={props?.returnFocusTo} />
    </QueryClientProvider>,
  );
}

describe('AddCommunityModal', () => {
  beforeEach(() => {
    useBillingGroupPreviewMock.mockReset();
    accessMock.mockReset();
    accessMock.mockReturnValue({ data: { allowed: true, billingGroupId: 7 } });
    triggerReauthMock.mockReset();
    triggerReauthMock.mockResolvedValue(true);
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

  it('disables submit until name, subdomain, unit count and a Florida ZIP are filled', () => {
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
    // The unit count is never pre-filled: it decides whether Florida's website
    // rules apply, so a default of 1 would mark the association exempt unasked.
    expect((screen.getByLabelText('Unit count') as HTMLInputElement).value).toBe('');
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Unit count'), { target: { value: '40' } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '33101' } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    // Clearing it stays empty (it used to snap back to 1) and re-locks submit.
    fireEvent.change(screen.getByLabelText('Unit count'), { target: { value: '' } });
    expect((screen.getByLabelText('Unit count') as HTMLInputElement).value).toBe('');
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for the password, then submits and renders EmbeddedCheckout on success', async () => {
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
    fireEvent.change(screen.getByLabelText('Unit count'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '33101' } });
    expect(screen.getByLabelText('Time zone').textContent).toContain('Eastern');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Payment' }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(triggerReauthMock).toHaveBeenCalledTimes(1);
    expect(triggerReauthMock.mock.invocationCallOrder[0]).toBeLessThan(mutateMock.mock.invocationCallOrder[0]!);
    const [formArg] = mutateMock.mock.calls[0]!;
    expect(formArg).toMatchObject({
      name: 'Sunset Condos',
      subdomain: 'sunset-condos',
      communityType: 'condo_718',
      planId: 'essentials',
      unitCount: 40,
      // Audit F7: the time zone is now a labelled choice; Eastern stays the default.
      timezone: 'America/New_York',
      state: 'FL',
      zipCode: '33101',
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

    expect(screen.getByRole('alert').textContent).toBe('Checkout creation failed');
  });

  it('shows the pending submit label while the mutation is in flight', () => {
    setPreview({ data: undefined });
    mutationState = { isPending: true, error: null };
    renderModal();

    expect(screen.getByText('Starting checkout…')).toBeDefined();
  });

  function fillValidForm() {
    fireEvent.change(screen.getByLabelText('Community name'), { target: { value: 'Sunset Condos' } });
    fireEvent.change(screen.getByLabelText('Subdomain'), { target: { value: 'sunset-condos' } });
    fireEvent.change(screen.getByLabelText('Unit count'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '33101' } });
  }

  function pick(label: string, option: string) {
    const trigger = screen.getByLabelText(label);
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('option', { name: option }));
  }

  it('does not start checkout when the password prompt is dismissed', async () => {
    setPreview({ data: undefined });
    triggerReauthMock.mockResolvedValue(false);
    renderModal();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Payment' }));

    await waitFor(() => expect(triggerReauthMock).toHaveBeenCalledTimes(1));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('prices against the billing group the access check returns', () => {
    setPreview({ data: undefined });
    accessMock.mockReturnValue({ data: { allowed: true, billingGroupId: 31 } });
    renderModal();

    expect(accessMock).toHaveBeenCalledWith(true);
    expect(useBillingGroupPreviewMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ billingGroupId: 31, enabled: true }),
    );
  });

  it('is Florida only: the state is fixed and an out-of-state ZIP blocks submit', () => {
    setPreview({ data: undefined });
    renderModal();
    fillValidForm();

    const state = screen.getByLabelText('State') as HTMLInputElement;
    expect(state.value).toBe('Florida');
    expect(state.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '30301' } });
    expect(screen.getByText('Enter a Florida ZIP code.')).toBeDefined();
    expect(screen.getByLabelText('ZIP').getAttribute('aria-invalid')).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Continue to Payment' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('offers only the plans the community type has, and moves the plan with the type', async () => {
    setPreview({ data: undefined });
    mutateMock.mockImplementation(() => {});
    renderModal();
    fillValidForm();

    pick('Community type', 'Apartment');
    // Essentials is a condo/HOA plan; an apartment falls to its first plan.
    expect(screen.getByLabelText('Plan').textContent).toContain('Operations Plus');

    fireEvent.pointerDown(screen.getByLabelText('Plan'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Operations Plus'),
    ]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Payment' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(mutateMock.mock.calls[0]![0]).toMatchObject({ communityType: 'apartment', planId: 'operations_plus' });
  });

  it('says so and will not submit when access was lost after opening', () => {
    setPreview({ data: undefined });
    accessMock.mockReturnValue({ data: { allowed: false, billingGroupId: null } });
    renderModal();
    fillValidForm();

    expect(screen.getByRole('alert').textContent).toMatch(/Only the root manager who pays/);
    expect(
      (screen.getByRole('button', { name: 'Continue to Payment' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  describe('focus on close (opened from state, so Radix alone would drop it on <body>)', () => {
    function Harness({ open, withRef }: { open: boolean; withRef: boolean }) {
      const qc = new QueryClient();
      return (
        <QueryClientProvider client={qc}>
          <button type="button" ref={menuButton}>
            Account
          </button>
          <button type="button">Opener</button>
          <AddCommunityModal open={open} onClose={vi.fn()} returnFocusTo={withRef ? menuButton : undefined} />
        </QueryClientProvider>
      );
    }
    const menuButton = { current: null as HTMLButtonElement | null };

    it('goes to the element it was given', async () => {
      setPreview({ data: undefined });
      const { rerender } = render(<Harness open withRef />);
      rerender(<Harness open={false} withRef />);

      await waitFor(() => expect(document.activeElement).toBe(menuButton.current));
    });

    it('otherwise goes back to whatever had focus when it opened', async () => {
      setPreview({ data: undefined });
      const { rerender } = render(<Harness open={false} withRef={false} />);
      const opener = screen.getByRole('button', { name: 'Opener' });
      opener.focus();
      rerender(<Harness open withRef={false} />);
      rerender(<Harness open={false} withRef={false} />);

      await waitFor(() => expect(document.activeElement).toBe(opener));
    });
  });
});
