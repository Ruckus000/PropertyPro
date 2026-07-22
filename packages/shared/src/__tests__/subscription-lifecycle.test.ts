import { describe, expect, it } from 'vitest';
import {
  canChangeExistingPlan,
  canStartNewSubscription,
} from '../billing/subscription-lifecycle';
import { ALL_STATUSES } from '../constants/subscription-statuses';

describe('canStartNewSubscription', () => {
  it('allows a community that has never had a subscription', () => {
    expect(
      canStartNewSubscription({ stripeSubscriptionId: null, subscriptionStatus: null }),
    ).toBe(true);
  });

  it('allows a re-subscribe after every churned status', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      expect(
        canStartNewSubscription({ stripeSubscriptionId: 'sub_x', subscriptionStatus: status }),
      ).toBe(true);
    }
  });

  it('blocks trialing — the case that used to double-bill every new customer', () => {
    // `subscriptionStatus === 'active'` was the old test. Every self-serve
    // signup spends its first 30 days in `trialing` with a LIVE subscription,
    // so that equality sold each of them a second one.
    expect(
      canStartNewSubscription({ stripeSubscriptionId: 'sub_x', subscriptionStatus: 'trialing' }),
    ).toBe(false);
  });

  it('blocks every other live status', () => {
    for (const status of ['active', 'past_due']) {
      expect(
        canStartNewSubscription({ stripeSubscriptionId: 'sub_x', subscriptionStatus: status }),
      ).toBe(false);
    }
  });

  it('blocks statuses Stripe may add later, rather than assuming they are dead', () => {
    // Allow-list of dead states, not a block-list of live ones: wrongly
    // blocking costs a support ticket, wrongly allowing charges someone twice.
    for (const status of ['incomplete', 'paused', 'something_new_in_2027']) {
      expect(
        canStartNewSubscription({ stripeSubscriptionId: 'sub_x', subscriptionStatus: status }),
      ).toBe(false);
    }
  });

  it('blocks a subscription id whose status has not been synced yet', () => {
    expect(
      canStartNewSubscription({ stripeSubscriptionId: 'sub_x', subscriptionStatus: null }),
    ).toBe(false);
  });

  it('never both allows a new subscription and an in-place change', () => {
    // The two predicates drive mutually exclusive UI modes; an overlap would
    // mean the page could offer a flow the API rejects, or two that conflict.
    for (const status of [...ALL_STATUSES, 'incomplete', 'paused']) {
      const state = { stripeSubscriptionId: 'sub_x', subscriptionStatus: status };
      expect(canStartNewSubscription(state) && canChangeExistingPlan(state)).toBe(false);
    }
  });
});

describe('canChangeExistingPlan', () => {
  it('accepts active, trialing and past_due — all updatable in Stripe', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(
        canChangeExistingPlan({ stripeSubscriptionId: 'sub_x', subscriptionStatus: status }),
      ).toBe(true);
    }
  });

  it('rejects churned statuses — nothing left to update', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      expect(
        canChangeExistingPlan({ stripeSubscriptionId: 'sub_x', subscriptionStatus: status }),
      ).toBe(false);
    }
  });

  it('rejects a community with no subscription id', () => {
    expect(
      canChangeExistingPlan({ stripeSubscriptionId: null, subscriptionStatus: 'active' }),
    ).toBe(false);
  });

  it('gives a trialing community exactly one valid path (change, not new)', () => {
    // Before the fix it had NEITHER: change-plan required `active` and the
    // checkout route would have minted a duplicate.
    const trialing = { stripeSubscriptionId: 'sub_x', subscriptionStatus: 'trialing' };
    expect(canStartNewSubscription(trialing)).toBe(false);
    expect(canChangeExistingPlan(trialing)).toBe(true);
  });
});
