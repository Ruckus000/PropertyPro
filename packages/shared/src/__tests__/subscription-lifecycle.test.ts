import { describe, expect, it } from 'vitest';
import {
  canChangeExistingPlan,
  canStartNewSubscription,
  isEntitledState,
  resolveLifecycleState,
  type LifecycleState,
} from '../billing/subscription-lifecycle';
import { PAID_GRACE_DAYS } from '../billing/paid-grace';
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


describe('resolveLifecycleState', () => {
  const NOW = new Date('2026-07-22T12:00:00.000Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  it('returns unprovisioned when no subscription has ever existed', () => {
    expect(
      resolveLifecycleState(
        { subscriptionStatus: null, subscriptionCanceledAt: null },
        NOW,
      ),
    ).toBe('unprovisioned');
  });

  it('maps the live statuses to their own states', () => {
    const cases: Array<[string, LifecycleState]> = [
      ['active', 'active'],
      ['trialing', 'trialing'],
      ['past_due', 'past_due'],
    ];
    for (const [status, expected] of cases) {
      expect(
        resolveLifecycleState({ subscriptionStatus: status, subscriptionCanceledAt: null }, NOW),
      ).toBe(expected);
    }
  });

  it('is grace inside the paid window and lapsed after it', () => {
    const inside = resolveLifecycleState(
      { subscriptionStatus: 'canceled', subscriptionCanceledAt: daysAgo(PAID_GRACE_DAYS - 1) },
      NOW,
    );
    const outside = resolveLifecycleState(
      { subscriptionStatus: 'canceled', subscriptionCanceledAt: daysAgo(PAID_GRACE_DAYS + 1) },
      NOW,
    );
    expect(inside).toBe('grace');
    expect(outside).toBe('lapsed');
  });

  it('is lapsed exactly at the grace boundary (exclusive)', () => {
    expect(
      resolveLifecycleState(
        { subscriptionStatus: 'canceled', subscriptionCanceledAt: daysAgo(PAID_GRACE_DAYS) },
        NOW,
      ),
    ).toBe('lapsed');
  });

  it('is lapsed when canceled with no timestamp — no grace can be computed', () => {
    expect(
      resolveLifecycleState({ subscriptionStatus: 'canceled', subscriptionCanceledAt: null }, NOW),
    ).toBe('lapsed');
  });

  it('gives no grace window to hard-stop churn statuses', () => {
    for (const status of ['expired', 'unpaid', 'incomplete_expired']) {
      expect(
        resolveLifecycleState(
          { subscriptionStatus: status, subscriptionCanceledAt: daysAgo(1) },
          NOW,
        ),
      ).toBe('lapsed');
    }
  });

  it('lets active free access override every churned status', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      expect(
        resolveLifecycleState(
          {
            subscriptionStatus: status,
            subscriptionCanceledAt: daysAgo(90),
            freeAccessExpiresAt: new Date(NOW.getTime() + 86_400_000),
          },
          NOW,
        ),
      ).toBe('comped');
    }
  });

  it('ignores free access that has already expired', () => {
    expect(
      resolveLifecycleState(
        {
          subscriptionStatus: 'active',
          subscriptionCanceledAt: null,
          freeAccessExpiresAt: daysAgo(1),
        },
        NOW,
      ),
    ).toBe('active');
  });

  it('treats unrecognized Stripe statuses as entitled, never as churned', () => {
    // These guards have always failed OPEN on unknown statuses. A Stripe
    // vocabulary change must not silently lock communities out.
    for (const status of ['incomplete', 'paused', 'something_new_in_2027']) {
      const state = resolveLifecycleState(
        { subscriptionStatus: status, subscriptionCanceledAt: null },
        NOW,
      );
      expect(state).toBe('active');
      expect(isEntitledState(state)).toBe(true);
    }
  });

  it('resolves every input combination to exactly one state — no gaps', () => {
    const statuses = [
      null, 'active', 'trialing', 'past_due', 'canceled',
      'expired', 'unpaid', 'incomplete_expired', 'incomplete', 'paused',
    ];
    const canceledAts = [null, daysAgo(1), daysAgo(PAID_GRACE_DAYS + 5)];
    const freeAccess = [null, daysAgo(1), new Date(NOW.getTime() + 86_400_000)];
    const valid: LifecycleState[] = [
      'unprovisioned', 'comped', 'trialing', 'active', 'past_due', 'grace', 'lapsed',
    ];

    for (const subscriptionStatus of statuses) {
      for (const subscriptionCanceledAt of canceledAts) {
        for (const freeAccessExpiresAt of freeAccess) {
          const state = resolveLifecycleState(
            { subscriptionStatus, subscriptionCanceledAt, freeAccessExpiresAt },
            NOW,
          );
          expect(valid).toContain(state);
        }
      }
    }
  });

  it('marks only lapsed as unentitled', () => {
    expect(isEntitledState('lapsed')).toBe(false);
    for (const state of ['unprovisioned', 'comped', 'trialing', 'active', 'past_due', 'grace'] as LifecycleState[]) {
      expect(isEntitledState(state)).toBe(true);
    }
  });
});
