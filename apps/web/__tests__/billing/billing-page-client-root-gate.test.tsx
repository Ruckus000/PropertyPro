import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * R3-03 — the billing page's read-only posture and its recovery path.
 *
 * The load-bearing case is a property manager in a community whose root seat is
 * VACANT: they can no longer purchase, and nobody else can either, so the
 * community is stuck until someone claims root. This surface is where they hit
 * that wall, so this is where the way out has to be.
 */

const { useMyRootlessMock } = vi.hoisted(() => ({ useMyRootlessMock: vi.fn() }));

vi.mock('@/hooks/use-claim-root', () => ({ useMyRootless: useMyRootlessMock }));
vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth: vi.fn(),
    isOpen: false,
    onCancel: vi.fn(),
    verify: vi.fn(),
  }),
}));
vi.mock('@/components/auth/reauth-modal', () => ({ ReauthModal: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BillingPageClient } from '@/components/settings/billing-page-client';

const baseProps = {
  communityId: 42,
  communityName: 'Sunset Condos',
  subscriptionPlan: 'essentials',
  subscriptionStatus: 'active',
  subscriptionInterval: 'month' as const,
  stripeCustomerId: 'cus_abc',
  paymentFailedAt: null,
};

describe('BillingPageClient — R3-03 root gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMyRootlessMock.mockReturnValue({ data: [] });
  });

  it('gives the root manager the billing actions', () => {
    render(<BillingPageClient {...baseProps} canView canManage />);

    expect(screen.getByRole('link', { name: /change plan/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /billing actions/i })).toBeInTheDocument();
  });

  it('withholds every action from a property manager', () => {
    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    expect(screen.queryByRole('link', { name: /change plan/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /billing actions/i }),
    ).not.toBeInTheDocument();
  });

  it('still shows a property manager the plan and status', () => {
    // Read-only, not hidden — hiding would make the capability loss invisible.
    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    expect(screen.getByText(/essentials/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('points a PM in a ROOTLESS community at the claim flow', () => {
    useMyRootlessMock.mockReturnValue({
      data: [{ id: 42, name: 'Sunset Condos', slug: 'sunset-condos' }],
    });

    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    const claim = screen.getByRole('link', { name: /claim root manager/i });
    expect(claim).toHaveAttribute('href', '/dashboard/claim-root');
  });

  it('tells a PM in a ROOTED community to contact the root manager', () => {
    useMyRootlessMock.mockReturnValue({ data: [] });

    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    expect(screen.getByText(/contact your community's root manager/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /claim root manager/i })).not.toBeInTheDocument();
  });

  it('does not offer the claim CTA for a DIFFERENT rootless community', () => {
    // The hook returns every rootless community the caller manages; only the
    // one being viewed is relevant here.
    useMyRootlessMock.mockReturnValue({
      data: [{ id: 99, name: 'Palm Shores', slug: 'palm-shores' }],
    });

    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    expect(screen.queryByRole('link', { name: /claim root manager/i })).not.toBeInTheDocument();
  });

  it('shows residents the contact-administrator copy and never queries rootless', () => {
    render(<BillingPageClient {...baseProps} canView={false} canManage={false} />);

    expect(screen.getByText(/contact your community administrator/i)).toBeInTheDocument();
    // A resident's rootless list is always empty — skip the request entirely.
    expect(useMyRootlessMock).toHaveBeenCalledWith(false);
  });

  // REGRESSION: the old notice was `{!isAdmin && hasStripe && ...}`. Every
  // rootless community in prod has no Stripe customer, so the member most
  // likely to be locked out saw a page with no actions and no explanation.
  it('explains itself even when the community has no Stripe customer', () => {
    render(
      <BillingPageClient
        {...baseProps}
        stripeCustomerId={null}
        subscriptionPlan={null}
        canView
        canManage={false}
      />,
    );

    expect(screen.getByText(/contact your community's root manager/i)).toBeInTheDocument();
  });

  it('explains the bounce when redirected with forbidden=root', () => {
    render(
      <BillingPageClient {...baseProps} canView canManage={false} bouncedFromRootGate />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /only the root manager can change billing/i,
    );
  });

  it('stays quiet when not bounced', () => {
    render(<BillingPageClient {...baseProps} canView canManage={false} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
