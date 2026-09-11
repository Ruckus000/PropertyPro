// @vitest-environment jsdom
/**
 * `BillingActionDialog` — the only thing in the console that can set
 * `confirm: true`, and the only place a Stripe mode refusal is read.
 *
 * Four properties, each of which has a one-line production revert that reddens
 * it (recorded in the task report):
 *
 * 1. Nothing is posted until the operator presses Confirm. The route enforces
 *    `confirm: z.literal(true)`, but a UI that posted on a radio click would
 *    satisfy that enforcement while defeating its purpose.
 * 2. The posted body is exactly the action's schema plus `confirm: true`, at
 *    the action's own endpoint.
 * 3. A `STRIPE_MODE_MISMATCH` refusal renders the SERVER's sentence, not a
 *    generic failure. In this repo's environment that is the state every one of
 *    these five actions is in, so it is the state the UI must handle best.
 * 4. A failure leaves the dialog OPEN. Radix's `AlertDialogAction` closes on
 *    click; if the click were not suppressed, the sentence in (3) would be
 *    unmounted before anyone could read it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { BillingActionDialog } from '@/components/clients/BillingActionDialog';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(body: unknown, status = 200): FetchMock {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function postedBody(fetchMock: FetchMock): unknown {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was never called');
  return JSON.parse((call[1] as RequestInit).body as string);
}

function confirmButton(): HTMLElement {
  return screen.getByRole('button', { name: /^confirm$/i });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BillingActionDialog', () => {
  it('posts confirm: true only after the operator confirms', async () => {
    const fetchMock = mockFetch({ data: {} });

    render(
      <BillingActionDialog communityId={1} action="extend-trial" open onOpenChange={() => {}} />,
    );

    fireEvent.click(screen.getByLabelText('14 days'));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody(fetchMock)).toEqual({ confirm: true, days: 14 });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/communities/1/billing/extend-trial');
  });

  it('posts the cancel schema and defaults to the reversible choice', async () => {
    const fetchMock = mockFetch({ data: {} });

    render(<BillingActionDialog communityId={7} action="cancel" open onOpenChange={() => {}} />);

    // Nothing clicked: the default must be cancel-at-period-end, the one that
    // can be undone from the Stripe dashboard.
    fireEvent.click(confirmButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody(fetchMock)).toEqual({ confirm: true, atPeriodEnd: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/communities/7/billing/cancel');
  });

  it('posts resume: false by default for the pause action', async () => {
    const fetchMock = mockFetch({ data: {} });

    render(<BillingActionDialog communityId={3} action="pause" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody(fetchMock)).toEqual({ confirm: true, resume: false });

    fireEvent.click(screen.getByLabelText('Resume collection'));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      confirm: true,
      resume: true,
    });
  });

  it("renders a mode refusal as the server's own sentence, and keeps the dialog open", async () => {
    const message =
      'Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE — refusing to change a subscription. ' +
      'STRIPE_SECRET_KEY is a test-mode key and this console expects live mode. ' +
      'Set STRIPE_EXPECTED_LIVEMODE=false if that is intended, or point STRIPE_SECRET_KEY at the live key.';
    mockFetch({ error: { code: 'STRIPE_MODE_MISMATCH', message } }, 503);

    const onOpenChange = vi.fn();
    render(
      <BillingActionDialog communityId={1} action="extend-trial" open onOpenChange={onOpenChange} />,
    );

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Refused: the Stripe key is in the wrong mode');
    expect(alert.textContent).toContain('STRIPE_EXPECTED_LIVEMODE');
    // The exact failure the specific code exists to prevent.
    expect(alert.textContent).not.toContain('An unexpected error occurred');

    // Still open, and the operator can still read the fields they submitted.
    expect(screen.getByLabelText('14 days')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the server\'s specific sentence for a price-config failure', async () => {
    mockFetch(
      { error: { code: 'STRIPE_PRICE_CONFIG_MISSING', message: 'No Stripe price is configured for plan=professional, communityType=apartment, billingInterval=month.' } },
      500,
    );

    render(<BillingActionDialog communityId={9} action="change-plan" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('communityType=apartment');
  });

  it('closes and refreshes only on success', async () => {
    mockFetch({ data: {} });
    const onOpenChange = vi.fn();
    const onCompleted = vi.fn();

    render(
      <BillingActionDialog
        communityId={4}
        action="apply-coupon"
        open
        onOpenChange={onOpenChange}
        onCompleted={onCompleted}
      />,
    );

    // Confirm is inert until a coupon id has been typed — an empty POST would
    // be a 400 round-trip for something the dialog already knows.
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Coupon id'), { target: { value: 'VOLUME10' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCompleted).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
});
