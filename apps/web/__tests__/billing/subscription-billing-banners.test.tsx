import { describe, expect, it } from 'vitest';
import { resolveSubscriptionBillingBannerState } from '@/components/billing/subscription-billing-banners';

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

  it('shows past_due banner for billing admins', () => {
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
  });
});
