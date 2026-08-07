import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatBillingDateUTC, paidGraceEndsAt } from '@propertypro/shared';
import {
  resolveSubscriptionBillingBannerState,
  SubscriptionBillingBanners,
} from '@/components/billing/subscription-billing-banners';

describe('resolveSubscriptionBillingBannerState', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  it('shows trialing banner for paid billing admins with period end', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'trialing',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: new Date('2026-07-25T12:00:00.000Z'),
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showTrialing).toBe(true);
    expect(state.showGrace).toBe(false);
    expect(state.showSoftLock).toBe(false);
    expect(state.showPastDue).toBe(false);
  });

  it('suppresses the grace banner while free access is still active', () => {
    // DELIBERATE behavior change (PR: lifecycle correctness). The old
    // open-coded isInGrace ignored free access entirely, so a canceled
    // community inside its grace window ALSO holding an active free-access
    // grant showed "access until <grace end>" — a date its free access
    // outlives. resolveLifecycleState resolves `comped` first, so neither the
    // grace nor the soft-lock banner renders and FreeAccessBanner owns the
    // messaging. Pinned here because no pre-existing banner test passed a
    // non-null freeAccessExpiresAt, so the untouched suite did not cover it.
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-07-09T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: new Date('2026-09-01T12:00:00.000Z'),
      isDemo: false,
      now,
    });

    expect(state.isInGrace).toBe(false);
    expect(state.showGrace).toBe(false);
    expect(state.showSoftLock).toBe(false);
  });

  it('still soft-locks a canceled community once free access has expired', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-06-01T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: new Date('2026-07-01T12:00:00.000Z'),
      isDemo: false,
      now,
    });

    expect(state.showSoftLock).toBe(true);
  });

  it('suppresses trialing banner for demo communities', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'trialing',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: new Date('2026-07-25T12:00:00.000Z'),
      freeAccessExpiresAt: null,
      isDemo: true,
      now,
    });

    expect(state.showTrialing).toBe(false);
  });

  it('shows grace banner during paid cancel grace window', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-07-10T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showGrace).toBe(true);
    expect(state.isInGrace).toBe(true);
    expect(state.showSoftLock).toBe(false);
  });

  it('shows soft lock after grace expires', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-06-01T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showGrace).toBe(false);
    expect(state.showSoftLock).toBe(true);
  });

  it('shows past_due banner for the root manager, with the action', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 2,
      subscriptionStatus: 'past_due',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showPastDue).toBe(true);
    expect(state.isBillingAdmin).toBe(true);
  });

  // R3-03 separates AWARENESS from ACTION. A property manager can no longer
  // pay, but must still learn the community is lapsing — suppressing the banner
  // would make the capability loss invisible at the worst possible moment.
  it('shows past_due banner to a property manager WITHOUT the action (R3-03)', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'property_manager',
      communityId: 2,
      subscriptionStatus: 'past_due',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showPastDue).toBe(true);
    expect(state.isBillingAdmin).toBe(false);
  });

  it('shows the trialing banner to a property manager without the action (R3-03)', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'property_manager',
      communityId: 2,
      subscriptionStatus: 'trialing',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: new Date('2026-08-20T12:00:00.000Z'),
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showTrialing).toBe(true);
    expect(state.isBillingAdmin).toBe(false);
  });

  it('still hides the past_due banner from residents', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'resident',
      communityId: 2,
      subscriptionStatus: 'past_due',
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.showPastDue).toBe(false);
  });

  it('exposes isBillingAdmin=false for residents (A7)', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'resident',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-07-10T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.isBillingAdmin).toBe(false);
    // Grace still shows to residents — they should know access is ending.
    expect(state.showGrace).toBe(true);
  });

  it('exposes isBillingAdmin=true for root_manager (A7)', () => {
    const state = resolveSubscriptionBillingBannerState({
      role: 'root_manager',
      communityId: 1,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2026-07-10T12:00:00.000Z'),
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      now,
    });

    expect(state.isBillingAdmin).toBe(true);
  });
});

describe('SubscriptionBillingBanners rendering (A4 UTC date + A7 role copy)', () => {
  const canceledAt = new Date('2026-07-10T12:00:00.000Z');
  const now = new Date('2026-07-11T12:00:00.000Z');
  const expectedGraceDate = formatBillingDateUTC(paidGraceEndsAt(canceledAt)); // "July 17, 2026"

  const graceProps = {
    communityId: 1,
    subscriptionStatus: 'canceled',
    subscriptionCanceledAt: canceledAt,
    subscriptionCurrentPeriodEndAt: null,
    freeAccessExpiresAt: null,
    isDemo: false,
    now,
  } as const;

  it('renders the grace end date in UTC long-form matching the email (A4)', () => {
    render(<SubscriptionBillingBanners role="root_manager" {...graceProps} />);
    expect(screen.getByText(new RegExp(expectedGraceDate))).toBeInTheDocument();
  });

  it('gives billing admins the Update Payment action on the grace banner (A7)', () => {
    render(<SubscriptionBillingBanners role="root_manager" {...graceProps} />);
    expect(screen.getByRole('link', { name: /update payment/i })).toBeInTheDocument();
  });

  it('gives residents contact-admin copy and no billing link on grace (A7)', () => {
    render(<SubscriptionBillingBanners role="resident" {...graceProps} />);
    expect(screen.queryByRole('link', { name: /update payment/i })).not.toBeInTheDocument();
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    // Still shows the accurate UTC end date.
    expect(screen.getByText(new RegExp(expectedGraceDate))).toBeInTheDocument();
  });

  it('gives residents contact-admin copy and no reactivate link on soft-lock (A7)', () => {
    render(
      <SubscriptionBillingBanners
        role="resident"
        communityId={1}
        subscriptionStatus="expired"
        subscriptionCanceledAt={null}
        subscriptionCurrentPeriodEndAt={null}
        freeAccessExpiresAt={null}
        isDemo={false}
        now={now}
      />,
    );
    expect(screen.queryByRole('link', { name: /reactivate/i })).not.toBeInTheDocument();
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
  });
});
