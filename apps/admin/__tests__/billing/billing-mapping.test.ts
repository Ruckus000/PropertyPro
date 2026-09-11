/**
 * The pure half of the billing module: Stripe payload → table row, rows → KPIs,
 * subscription → timeline, and the two pure helpers the signal provider uses.
 *
 * Nothing here touches Stripe or the database, which is the point — every number
 * the portfolio reports is computed by these functions, so the MRR arithmetic, the
 * annual normalisation and the orphan case are all testable without a Stripe
 * account or a mode-matched key.
 */
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';

import {
  buildTimeline,
  computeBillingKpis,
  filterBillingRows,
  mapSubscription,
  type BillingRow,
} from '@/lib/server/billing';
import { daysPastDue, pastDueHref } from '@/lib/server/signals/billing';

/**
 * A minimal Stripe subscription.
 *
 * `current_period_end` sits at the SUBSCRIPTION level here. In apiVersion
 * `2026-01-28.clover` the field lives on the item and the SDK does not declare it
 * on `Subscription` at all — `periodEndOf` accepts both, and this fixture
 * deliberately exercises the fallback leg. `itemPeriodSub` below covers the other.
 */
const sub = (over: Record<string, unknown> = {}) =>
  ({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    created: 1_728_000_000,
    current_period_end: 1_760_659_200,
    trial_end: null,
    canceled_at: null,
    cancel_at_period_end: false,
    pause_collection: null,
    discounts: [],
    items: {
      data: [{ id: 'si_1', price: { unit_amount: 24_000, recurring: { interval: 'month' } }, quantity: 1 }],
    },
    ...over,
  }) as unknown as Stripe.Subscription;

const community = { id: 1, name: 'Bayview', subscription_plan: 'professional' };

describe('mapSubscription', () => {
  it('monthly MRR is the unit amount', () => {
    expect(mapSubscription(sub(), community).mrrCents).toBe(24_000);
  });

  it('annual MRR is the unit amount over 12', () => {
    const annual = sub({
      items: {
        data: [{ id: 'si_1', price: { unit_amount: 240_000, recurring: { interval: 'year' } }, quantity: 1 }],
      },
    });
    const row = mapSubscription(annual, undefined);
    expect(row.mrrCents).toBe(20_000);
    expect(row.interval).toBe('year');
  });

  it('multiplies by quantity before normalising the interval', () => {
    const row = mapSubscription(
      sub({
        items: {
          data: [{ id: 'si_1', price: { unit_amount: 120_000, recurring: { interval: 'year' } }, quantity: 3 }],
        },
      }),
      undefined,
    );
    // 120000 × 3 = 360000 a year = 30000 a month. Dividing before multiplying
    // would round each unit and then triple the rounding error.
    expect(row.mrrCents).toBe(30_000);
  });

  it('an orphan subscription keeps a name and null community', () => {
    const row = mapSubscription(sub(), undefined);
    expect(row.communityId).toBeNull();
    expect(row.communityName).toBe('Unlinked · cus_1');
  });

  it('reads the customer id from an expanded customer object', () => {
    const row = mapSubscription(sub({ customer: { id: 'cus_expanded' } }), undefined);
    expect(row.stripeCustomerId).toBe('cus_expanded');
    expect(row.communityName).toBe('Unlinked · cus_expanded');
  });

  it('maps past_due with the period end as pastDueSince and flags coupons', () => {
    const row = mapSubscription(sub({ status: 'past_due', discounts: [{ id: 'di_1' }] }), undefined);
    expect(row.status).toBe('past_due');
    expect(row.pastDueSince).toBe('2025-10-17T00:00:00.000Z');
    expect(row.hasCoupon).toBe(true);
  });

  it('leaves pastDueSince null for a healthy subscription', () => {
    const row = mapSubscription(sub(), community);
    expect(row.pastDueSince).toBeNull();
    expect(row.renewsAt).toBe('2025-10-17T00:00:00.000Z');
  });

  it('prefers the ITEM period end, which is where this API version puts it', () => {
    const row = mapSubscription(
      sub({
        // A different value at each level, so the assertion can only pass if the
        // item wins. Equal values would make this test vacuous.
        current_period_end: 1_760_659_200,
        items: {
          data: [
            {
              id: 'si_1',
              current_period_end: 1_767_225_600,
              price: { unit_amount: 24_000, recurring: { interval: 'month' } },
              quantity: 1,
            },
          ],
        },
      }),
      community,
    );
    expect(row.renewsAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('collapses an unrecognised Stripe status to "other"', () => {
    expect(mapSubscription(sub({ status: 'incomplete_expired' }), community).status).toBe('other');
    expect(mapSubscription(sub({ status: 'unpaid' }), community).status).toBe('other');
  });

  it('falls back to the price lookup_key when no community row names the plan', () => {
    const row = mapSubscription(
      sub({
        items: {
          data: [
            {
              id: 'si_1',
              price: { unit_amount: 24_000, lookup_key: 'professional', recurring: { interval: 'month' } },
              quantity: 1,
            },
          ],
        },
      }),
      undefined,
    );
    expect(row.plan).toBe('professional');
  });
});

const row = (over: Partial<BillingRow> = {}): BillingRow => ({
  communityId: 1,
  communityName: 'Bayview',
  plan: 'professional',
  status: 'active',
  mrrCents: 24_000,
  interval: 'month',
  renewsAt: '2026-10-01T00:00:00.000Z',
  trialEndsAt: null,
  pastDueSince: null,
  hasCoupon: false,
  stripeSubscriptionId: 'sub_1',
  stripeCustomerId: 'cus_1',
  ...over,
});

describe('computeBillingKpis', () => {
  const now = new Date('2026-09-11T00:00:00Z');

  it('counts active and trialing toward MRR and past_due separately', () => {
    const kpis = computeBillingKpis(
      [
        row({ status: 'active', mrrCents: 24_000 }),
        row({ status: 'trialing', mrrCents: 9_900 }),
        row({ status: 'past_due', mrrCents: 14_900 }),
        row({ status: 'canceled', mrrCents: 99_900 }),
      ],
      now,
    );
    expect(kpis.mrrCents).toBe(33_900);
    expect(kpis.pastDueCents).toBe(14_900);
  });

  it('counts only trials ending inside the next 14 days', () => {
    const kpis = computeBillingKpis(
      [
        row({ trialEndsAt: '2026-09-12T00:00:00.000Z' }), // tomorrow — counts
        row({ trialEndsAt: '2026-09-25T00:00:00.000Z' }), // day 14 — counts
        row({ trialEndsAt: '2026-09-26T00:00:00.000Z' }), // day 15 — does not
        row({ trialEndsAt: '2026-09-01T00:00:00.000Z' }), // already over
        row({ trialEndsAt: null }),
      ],
      now,
    );
    expect(kpis.trialsEnding14d).toBe(2);
  });

  it('counts coupons', () => {
    expect(
      computeBillingKpis([row({ hasCoupon: true }), row({ hasCoupon: true }), row()], now)
        .couponsActive,
    ).toBe(2);
  });
});

describe('filterBillingRows', () => {
  const rows = [row({ status: 'active' }), row({ status: 'past_due' }), row({ status: 'canceled' })];

  it('returns everything for no filter and for "all"', () => {
    expect(filterBillingRows(rows, null)).toHaveLength(3);
    expect(filterBillingRows(rows, 'all')).toHaveLength(3);
  });

  it('filters to one status', () => {
    expect(filterBillingRows(rows, 'past_due').map((r) => r.status)).toEqual(['past_due']);
  });
});

describe('buildTimeline', () => {
  it('records the cancel-at-period-end schedule and sorts newest first', () => {
    const entries = buildTimeline(
      sub({ cancel_at_period_end: true }),
      mapSubscription(sub({ cancel_at_period_end: true }), community),
    );
    expect(entries.map((e) => e.text)).toEqual(['Cancels at period end', 'Subscription created']);
    expect(entries[0]!.tone).toBe('danger');
  });

  it('records a payment failure for a past-due subscription', () => {
    const pastDue = sub({ status: 'past_due' });
    const texts = buildTimeline(pastDue, mapSubscription(pastDue, community)).map((e) => e.text);
    expect(texts).toContain('Payment failed');
  });

  it('names the pause behaviour rather than just "paused"', () => {
    const paused = sub({ pause_collection: { behavior: 'mark_uncollectible', resumes_at: null } });
    const texts = buildTimeline(paused, mapSubscription(paused, community)).map((e) => e.text);
    expect(texts).toContain('Collection paused (mark_uncollectible)');
  });
});

describe('past-due signal helpers', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');

  it('floors whole elapsed days', () => {
    expect(daysPastDue('2026-09-08T00:00:00.000Z', now)).toBe(3);
    expect(daysPastDue('2026-09-08T23:59:00.000Z', now)).toBe(2);
  });

  it('never reports a negative age, and treats a missing date as zero', () => {
    expect(daysPastDue('2026-09-20T00:00:00.000Z', now)).toBe(0);
    expect(daysPastDue(null, now)).toBe(0);
    expect(daysPastDue('not a date', now)).toBe(0);
  });

  it('sends an orphan to the portfolio, never to /clients/null', () => {
    expect(pastDueHref(row({ communityId: 7 }))).toBe('/clients/7?tab=billing');
    expect(pastDueHref(row({ communityId: null }))).toBe('/billing');
  });
});
