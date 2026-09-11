// @vitest-environment jsdom
/**
 * `/billing`'s two client components.
 *
 * Two classes of defect are pinned here, both of which render something that
 * LOOKS right:
 *
 * 1. **Unit confusion.** `BillingOverview` is denominated in cents while
 *    `dashboard-series.ts` exposes the same snapshot column in dollars. A
 *    missing `/100` renders $4,200 of MRR as $420,000 — a plausible number, not
 *    a visibly broken one.
 * 2. **Decorative trends.** Wave 2's KPI grid hardcoded an upward trend on all
 *    four cards, so every metric read as improving whichever way it had moved.
 *    A trend must be derived from a delta, and a card with no delta must show
 *    no arrow at all.
 *
 * And one correctness property: an ORPHAN row — a live Stripe subscription with
 * no `communities` row — must link into Stripe, because there is no console
 * page to link to and the row is the single most valuable finding this screen
 * produces.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { BillingKpis } from '@/components/billing/BillingKpis';
import { BillingList } from '@/components/billing/BillingList';
import type { BillingRow } from '@/lib/server/billing';

function row(overrides: Partial<BillingRow> & { stripeSubscriptionId: string }): BillingRow {
  return {
    communityId: 1,
    communityName: 'Sunset Condos',
    plan: 'professional',
    status: 'active',
    mrrCents: 19_900,
    interval: 'month',
    renewsAt: '2026-10-01T00:00:00.000Z',
    trialEndsAt: null,
    pastDueSince: null,
    hasCoupon: false,
    stripeCustomerId: 'cus_1',
    ...overrides,
  };
}

const KPIS = {
  mrrCents: 420_000,
  mrrDeltaPct: null as number | null,
  pastDueCents: 19_900,
  trialsEnding14d: 3,
  couponsActive: 2,
};

describe('BillingKpis', () => {
  it('renders cents as dollars', () => {
    render(<BillingKpis kpis={KPIS} series={[]} />);

    // 420_000 cents is $4,200. The un-divided value would read $420,000.
    expect(screen.getByText('$4,200')).toBeTruthy();
    expect(screen.queryByText('$420,000')).toBeNull();
    expect(screen.getByText('$199')).toBeTruthy();
  });

  it('converts the MRR series to dollars before charting it', () => {
    render(
      <BillingKpis
        kpis={KPIS}
        series={[
          { month: '2026-08', value: 400_000 },
          { month: '2026-09', value: 420_000 },
        ]}
      />,
    );

    // MiniBars prints the raw value in each bar's hover title, so the series
    // unit is observable rather than only implied by the bar heights.
    expect(screen.getByTitle('2026-09: 4,200')).toBeTruthy();
  });

  it('shows no delta arrow when there is no delta to show', () => {
    const { container } = render(<BillingKpis kpis={KPIS} series={[]} />);

    // `KpiCard` renders the delta row only when `delta !== undefined`, so a
    // hardcoded trend on a deltaless card would show up as a stray percentage.
    expect(container.textContent).not.toContain('%');
  });

  it('derives the MRR trend direction from the sign of the delta', () => {
    const { container: down } = render(
      <BillingKpis kpis={{ ...KPIS, mrrDeltaPct: -4 }} series={[]} />,
    );
    expect(down.querySelector('.text-status-danger')).not.toBeNull();

    const { container: up } = render(
      <BillingKpis kpis={{ ...KPIS, mrrDeltaPct: 4 }} series={[]} />,
    );
    expect(up.querySelector('.text-status-success')).not.toBeNull();
  });
});

describe('BillingList', () => {
  const base = 'https://dashboard.stripe.com/test/';

  it('links a linked community into the workspace Billing tab', () => {
    render(
      <BillingList
        rows={[row({ stripeSubscriptionId: 'sub_1', communityId: 42 })]}
        truncated={false}
        stripeDashboardBase={base}
      />,
    );

    expect(screen.getByRole('link', { name: 'Sunset Condos' }).getAttribute('href')).toBe(
      '/clients/42?tab=billing',
    );
  });

  it('links an orphan into Stripe and says why', () => {
    render(
      <BillingList
        rows={[
          row({
            stripeSubscriptionId: 'sub_orphan',
            communityId: null,
            communityName: 'Unlinked · cus_9',
          }),
        ]}
        truncated={false}
        stripeDashboardBase={base}
      />,
    );

    expect(screen.getByRole('link', { name: /Unlinked/ }).getAttribute('href')).toBe(
      'https://dashboard.stripe.com/test/subscriptions/sub_orphan',
    );
    expect(screen.getByText('No community record — still being charged.')).toBeTruthy();
  });

  it('filters by status and keeps the counts over the whole portfolio', () => {
    render(
      <BillingList
        rows={[
          row({ stripeSubscriptionId: 'sub_1' }),
          row({ stripeSubscriptionId: 'sub_2', status: 'past_due', communityName: 'Palm Shores' }),
        ]}
        truncated={false}
        stripeDashboardBase={base}
      />,
    );

    expect(screen.getByText('Sunset Condos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Past due/ }));

    expect(screen.queryByText('Sunset Condos')).toBeNull();
    expect(screen.getByText('Palm Shores')).toBeTruthy();
  });

  it('distinguishes an empty filter from an empty portfolio', () => {
    const { rerender } = render(
      <BillingList rows={[]} truncated={false} stripeDashboardBase={base} />,
    );
    expect(screen.getByText('No subscriptions yet')).toBeTruthy();

    rerender(
      <BillingList
        rows={[row({ stripeSubscriptionId: 'sub_1' })]}
        truncated={false}
        stripeDashboardBase={base}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Canceled/ }));
    expect(screen.getByText('Nothing in this filter')).toBeTruthy();
  });

  it('says so when Stripe reported more subscriptions than were read', () => {
    render(
      <BillingList
        rows={[row({ stripeSubscriptionId: 'sub_1' })]}
        truncated
        stripeDashboardBase={base}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('truncated');
  });
});
