// @vitest-environment jsdom
/**
 * The workspace Billing tab's four data states, and the one that matters most
 * here: a Stripe MODE REFUSAL must not take the read-only tab down with it.
 *
 * `billing.ts` is deliberately not gated on Stripe mode and `billing-actions.ts`
 * is, so in this repo's environment (test key, live expected) the plan card,
 * invoices and timeline all render while all five writes answer 503. A tab that
 * blanked, or that reported the refusal as a load failure, would hide the
 * subscription state an operator needs in order to understand the refusal.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BillingTab } from '@/components/clients/BillingTab';
import type { CommunityBilling } from '@/lib/server/billing';

const BILLING: CommunityBilling = {
  row: {
    communityId: 42,
    communityName: 'Sunset Condos',
    plan: 'professional',
    status: 'trialing',
    mrrCents: 19_900,
    interval: 'month',
    renewsAt: '2026-10-01T00:00:00.000Z',
    trialEndsAt: '2026-09-20T00:00:00.000Z',
    pastDueSince: null,
    hasCoupon: false,
    stripeSubscriptionId: 'sub_123',
    stripeCustomerId: 'cus_123',
  },
  invoices: [
    {
      id: 'in_1',
      number: 'ABC-0001',
      date: '2026-09-01T00:00:00.000Z',
      amountCents: 19_900,
      status: 'paid',
      hostedUrl: 'https://invoice.stripe.com/i/abc',
    },
  ],
  timeline: [
    { text: 'Trial ends', when: '2026-09-20T00:00:00.000Z', tone: 'info' },
    { text: 'Subscription created', when: '2026-08-20T00:00:00.000Z', tone: 'neutral' },
  ],
  stripeDashboardUrl: 'https://dashboard.stripe.com/test/subscriptions/sub_123',
  livemode: false,
};

type FetchMock = ReturnType<typeof vi.fn>;

/** GET the tab's own read, then whatever the action POST should answer. */
function mockFetch(readBody: unknown, action?: { body: unknown; status: number }): FetchMock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (!action) throw new Error(`Unexpected POST to ${String(input)}`);
      return new Response(JSON.stringify(action.body), { status: action.status });
    }
    return new Response(JSON.stringify(readBody), { status: 200 });
  }) as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BillingTab', () => {
  it('shows a busy state while the read is in flight', () => {
    // Never resolves: the loading branch is the only thing that can be on screen.
    global.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;

    render(<BillingTab communityId={42} />);

    expect(screen.getByRole('status', { name: 'Loading billing' })).toBeTruthy();
  });

  it('renders the plan, invoices and timeline once loaded', async () => {
    mockFetch({ data: BILLING });

    render(<BillingTab communityId={42} />);

    expect(await screen.findByText('Professional')).toBeTruthy();
    // 19_900 cents is $199 — NOT $19,900. The unit is the trap this screen has.
    expect(screen.getByText(/\$199 \/ month/)).toBeTruthy();
    expect(screen.getByText('ABC-0001')).toBeTruthy();
    expect(screen.getByText('Subscription created')).toBeTruthy();
    expect(screen.getByText('Stripe test mode')).toBeTruthy();
  });

  it('treats a community with no subscription as empty, not as an error', async () => {
    mockFetch({
      data: {
        row: null,
        invoices: [],
        timeline: [],
        stripeDashboardUrl: 'https://dashboard.stripe.com/test/subscriptions',
        livemode: false,
      },
    });

    render(<BillingTab communityId={42} />);

    expect(
      await screen.findByText('No Stripe subscription is linked to this community'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("surfaces a failed read with the server's message and a retry", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Community not found' } }), {
          status: 404,
        }),
    ) as unknown as FetchMock;
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BillingTab communityId={42} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Community not found');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('keeps the read-only tab intact when an action is refused for Stripe mode', async () => {
    const message =
      'Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE — refusing to change a subscription. ' +
      'STRIPE_SECRET_KEY is a test-mode key and this console expects live mode.';
    mockFetch({ data: BILLING }, {
      status: 503,
      body: { error: { code: 'STRIPE_MODE_MISMATCH', message } },
    });

    render(<BillingTab communityId={42} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Extend trial' }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('STRIPE_EXPECTED_LIVEMODE');
    expect(alert.textContent).not.toContain('An unexpected error occurred');

    // The whole point of the read/write split: none of this went away.
    expect(screen.getByText('Professional')).toBeTruthy();
    expect(screen.getByText('ABC-0001')).toBeTruthy();
    expect(screen.getByText('Subscription created')).toBeTruthy();
  });

  it('deep-links a refund to Stripe rather than offering a refund button', async () => {
    mockFetch({ data: BILLING });

    render(<BillingTab communityId={42} />);

    const refund = await screen.findByRole('link', { name: /issue refund/i });
    expect(refund.getAttribute('href')).toBe('https://dashboard.stripe.com/test/customers/cus_123');
  });
});
