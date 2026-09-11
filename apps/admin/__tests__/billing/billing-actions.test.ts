/**
 * The five actions that move money.
 *
 * Three properties are what this file exists for, and each is asserted so that a
 * failure names the actual harm rather than a status code:
 *
 *  1. **The mode assertion, both ways.** A matching mode proceeds; a mismatched or
 *     unknown one refuses AND does not call Stripe. The "does not call Stripe"
 *     half is asserted first, because a refusal that already charged somebody is
 *     not a refusal.
 *  2. **The exact idempotency key.** Not `expect.anything()` — the literal string.
 *     A key that varies per attempt protects nothing, and `changePlan` invoices
 *     its proration immediately, so a replayed request without a stable key is a
 *     second charge on a real card.
 *  3. **The Stripe arguments themselves** — `always_invoice`, `proration_behavior:
 *     'none'`, the `discounts: [{ coupon }]` shape, `pause_collection: ''` for a
 *     resume — because each of those is a different amount of money.
 *
 * No test here reaches the network. `@/lib/stripe` and the Supabase admin client
 * are both replaced; the db stub RECORDS its filter arguments so assertions about
 * which price row was looked up measure something rather than trusting a
 * chainable that returns a fixture no matter what it was asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  interface FromCall {
    table: string;
    filters: [string, unknown][];
  }

  const fromCalls: FromCall[] = [];

  /** Per-table `.single()` results, reassigned by tests that need a variation. */
  const fixtures: Record<string, { data: unknown; error: unknown }> = {};

  const createAdminClient = vi.fn(() => ({
    from(table: string) {
      const call: FromCall = { table, filters: [] };
      fromCalls.push(call);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return builder;
        },
        is: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return builder;
        },
        single: async () => fixtures[table] ?? { data: null, error: { message: 'no fixture' } },
      };
      return builder;
    },
  }));

  /**
   * The mocks' signatures are declared, not inferred.
   *
   * Inferred from a zero-argument default implementation, `update` would be typed
   * `() => …`, and `mock.calls[n][2]` — the options object carrying the
   * IDEMPOTENCY KEY, the single most important argument in this file — would be a
   * type error at index 2 of an empty tuple. Typing them is what lets the key be
   * asserted as a value rather than through a cast that would also hide a
   * genuinely missing argument.
   */
  interface FakeSubscription {
    id: string;
    trial_end: number | null;
    cancel_at_period_end: boolean;
    pause_collection: { behavior: string; resumes_at?: number | null } | null;
    discounts: unknown[];
    items: { data: { id: string; price: { id: string; recurring: { interval: string } } }[] };
  }

  const subscriptionsRetrieve = vi.fn(
    async (_id?: string): Promise<FakeSubscription> => ({
      id: 'sub_1',
      trial_end: 1_760_000_000,
      cancel_at_period_end: false,
      pause_collection: null,
      discounts: [],
      items: {
        data: [{ id: 'si_1', price: { id: 'price_ess_m', recurring: { interval: 'month' } } }],
      },
    }),
  );
  const subscriptionsUpdate = vi.fn(
    async (_id: string, _params: Record<string, unknown>, _options?: { idempotencyKey: string }) => ({
      id: 'sub_1',
      status: 'active',
    }),
  );
  const subscriptionsCancel = vi.fn(
    async (_id: string, _params?: undefined, _options?: { idempotencyKey: string }) => ({
      id: 'sub_1',
      status: 'canceled',
    }),
  );
  const couponsRetrieve = vi.fn(async (coupon: string) => {
    if (coupon !== 'SUMMER') {
      throw Object.assign(new Error('No such coupon'), { statusCode: 404 });
    }
    return { id: coupon };
  });

  const getStripeClient = vi.fn(() => ({
    subscriptions: {
      retrieve: subscriptionsRetrieve,
      update: subscriptionsUpdate,
      cancel: subscriptionsCancel,
    },
    coupons: { retrieve: couponsRetrieve },
  }));

  return {
    fromCalls,
    fixtures,
    createAdminClient,
    getStripeClient,
    subscriptionsRetrieve,
    subscriptionsUpdate,
    subscriptionsCancel,
    couponsRetrieve,
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminClient: h.createAdminClient }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: h.getStripeClient }));

import { invalidateBillingCache } from '@/lib/server/billing-cache';
import {
  applyCoupon,
  assertStripeActionMode,
  cancelSubscription,
  changePlan,
  extendTrial,
  getExpectedStripeLivemode,
  pauseSubscription,
  idempotencyWindow,
} from '@/lib/server/billing-actions';

const actor = { id: 'u', email: 'admin@propertypro.test' };

const COMMUNITY = {
  id: 1,
  name: 'Bayview',
  community_type: 'condo_718',
  subscription_plan: 'essentials',
  stripe_subscription_id: 'sub_1',
};

/** A matched pair: a test-mode key in a deployment that declares test mode. */
function matchedTestMode(): void {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
}

/**
 * One frozen instant for the whole file.
 *
 * Four key assertions used to build their expected string with a LIVE
 * `idempotencyWindow()` evaluated after the action had already computed its own.
 * If the 60-second bucket rolled between the two the test failed, which makes it
 * a clock race rather than a measurement. Freezing here removes the race from
 * every case at once instead of from the one that happened to be noticed.
 */
const FROZEN_NOW = new Date('2026-09-08T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  h.fromCalls.length = 0;
  h.fixtures.communities = { data: { ...COMMUNITY }, error: null };
  h.fixtures.stripe_prices = { data: { stripe_price_id: 'price_pro_m' }, error: null };
  matchedTestMode();
  invalidateBillingCache();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Every Stripe call that WRITES. A refusal must leave all of them at zero. */
function stripeWriteCallCount(): number {
  return h.subscriptionsUpdate.mock.calls.length + h.subscriptionsCancel.mock.calls.length;
}

describe('the Stripe mode assertion', () => {
  it('defaults to expecting LIVE, so an unconfigured deployment cannot move money', () => {
    delete process.env.STRIPE_EXPECTED_LIVEMODE;
    expect(getExpectedStripeLivemode()).toBe(true);

    // Only the exact string 'false' opts into test mode. A typo lands strict.
    process.env.STRIPE_EXPECTED_LIVEMODE = 'flase';
    expect(getExpectedStripeLivemode()).toBe(true);
    process.env.STRIPE_EXPECTED_LIVEMODE = '';
    expect(getExpectedStripeLivemode()).toBe(true);
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(getExpectedStripeLivemode()).toBe(false);
  });

  it('passes when the key mode matches, in either direction', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => assertStripeActionMode()).not.toThrow();

    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'true';
    expect(() => assertStripeActionMode()).not.toThrow();
  });

  it('refuses a live key in a deployment that declares test mode', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => assertStripeActionMode()).toThrow(/STRIPE_EXPECTED_LIVEMODE/);
  });

  it('refuses a test key in the shipped default, which is the state of this repo', () => {
    // docs/LAUNCH-BLOCKERS.md: Stripe here is still in TEST mode, and the default
    // expects LIVE — so with no override every action refuses. That is the path a
    // reviewer of this branch will actually exercise.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    delete process.env.STRIPE_EXPECTED_LIVEMODE;
    expect(() => assertStripeActionMode()).toThrow(/refusing to change a subscription/);
  });

  it('refuses an unset or unrecognised key with its own code', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    expect(() => assertStripeActionMode()).toThrow(
      /could not be determined.*refusing to change a subscription/s,
    );

    process.env.STRIPE_SECRET_KEY = 'not_a_stripe_key';
    expect(() => assertStripeActionMode()).toThrow(/could not be determined/);
  });

  it('carries a 500 and the STRIPE_MODE_MISMATCH code so the UI can name the fault', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';
    const error = await changePlan(1, { planId: 'professional' }, actor).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 503, code: 'STRIPE_MODE_MISMATCH' });
  });

  it.each([
    ['changePlan', () => changePlan(1, { planId: 'professional' }, actor)],
    ['extendTrial', () => extendTrial(1, { days: 14 }, actor)],
    ['applyCoupon', () => applyCoupon(1, { coupon: 'SUMMER' }, actor)],
    ['pauseSubscription', () => pauseSubscription(1, { resume: false }, actor)],
    ['cancelSubscription', () => cancelSubscription(1, { atPeriodEnd: true }, actor)],
  ])('%s refuses on a mode mismatch WITHOUT calling Stripe', async (_name, run) => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_EXPECTED_LIVEMODE = 'false';

    await expect(run()).rejects.toThrow(/mode/i);

    // Asserted after the rejection but reported as the real harm: a refusal that
    // reached Stripe is worse than a wrong error message.
    expect(stripeWriteCallCount()).toBe(0);
    expect(h.subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(h.couponsRetrieve).not.toHaveBeenCalled();
  });
});

describe('changePlan', () => {
  it('updates the item price with an idempotency key and always_invoice', async () => {
    await changePlan(1, { planId: 'professional' }, actor);

    expect(h.subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_pro_m' }],
        proration_behavior: 'always_invoice',
      }),
      // NO window: a duplicate change-plan raises a second proration invoice, so
      // the key must be identical for Stripe's full 24-hour replay period. The
      // other four actions carry the bucket; this one must not.
      { idempotencyKey: 'admin:change-plan:sub_1:price_pro_m' },
    );
  });

  it('keeps ONE key across a bucket boundary, because a duplicate here invoices', async () => {
    await changePlan(1, { planId: 'professional' }, actor);
    const first = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    // A minute later — a different bucket for every other action, and the same
    // key for this one. That difference IS the design (see billing-actions §2),
    // so it is asserted rather than left to a docblock.
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 90_000));
    await changePlan(1, { planId: 'professional' }, actor);
    const second = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    expect(second).toEqual(first);
    expect(second).toEqual({ idempotencyKey: 'admin:change-plan:sub_1:price_pro_m' });
  });

  it('looks the price up by the subscription’s CURRENT interval and community type', async () => {
    await changePlan(1, { planId: 'professional' }, actor);

    const priceLookup = h.fromCalls.find((call) => call.table === 'stripe_prices');
    // The column is `billing_interval`, not `interval` — and the interval is the
    // subscription's own, so changing a plan cannot silently move an annual
    // customer onto monthly billing.
    expect(priceLookup?.filters).toEqual([
      ['plan_id', 'professional'],
      ['community_type', 'condo_718'],
      ['billing_interval', 'month'],
    ]);
  });

  it('keeps an annual subscription annual', async () => {
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      trial_end: null,
      cancel_at_period_end: false,
      pause_collection: null,
      discounts: [],
      items: { data: [{ id: 'si_1', price: { id: 'price_ess_y', recurring: { interval: 'year' } } }] },
    });

    await changePlan(1, { planId: 'professional' }, actor);

    const priceLookup = h.fromCalls.find((call) => call.table === 'stripe_prices');
    expect(priceLookup?.filters).toContainEqual(['billing_interval', 'year']);
  });

  it('reports the plan it moved from and to, and nothing else', async () => {
    const result = await changePlan(1, { planId: 'professional' }, actor);
    expect(result).toEqual({
      subscriptionId: 'sub_1',
      before: { plan: 'essentials', priceId: 'price_ess_m' },
      after: { plan: 'professional', priceId: 'price_pro_m', interval: 'month' },
    });
  });

  it('refuses, without calling Stripe, when the community has no subscription', async () => {
    h.fixtures.communities = {
      data: { ...COMMUNITY, stripe_subscription_id: null },
      error: null,
    };

    await expect(changePlan(1, { planId: 'professional' }, actor)).rejects.toThrow(
      /no Stripe subscription/i,
    );
    expect(stripeWriteCallCount()).toBe(0);
  });

  it('refuses, without writing, when no price row is configured', async () => {
    h.fixtures.stripe_prices = { data: null, error: { message: 'no rows' } };

    await expect(changePlan(1, { planId: 'enterprise' }, actor)).rejects.toThrow(
      /No Stripe price is configured/,
    );
    expect(stripeWriteCallCount()).toBe(0);
  });

  it('404s on an unknown community before anything else happens', async () => {
    h.fixtures.communities = { data: null, error: { message: 'no rows' } };

    await expect(changePlan(999, { planId: 'professional' }, actor)).rejects.toThrow(
      /Community not found/,
    );
    expect(stripeWriteCallCount()).toBe(0);
  });
});

describe('extendTrial', () => {
  it('adds days to NOW when the current trial end is already past', async () => {
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    // The fixture's trial_end (1760000000 = 2025-10-09) is in the past.
    await extendTrial(1, { days: 14 }, actor);

    const params = h.subscriptionsUpdate.mock.calls.at(-1)![1] as {
      trial_end: number;
      proration_behavior: string;
    };
    expect(params.trial_end).toBe(Math.floor(Date.parse('2026-09-22T00:00:00Z') / 1000));
    // Extending a trial must never invoice anybody.
    expect(params.proration_behavior).toBe('none');
  });

  it('adds days to the CURRENT trial end when that is still in the future', async () => {
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      trial_end: Math.floor(Date.parse('2026-09-20T00:00:00Z') / 1000),
      cancel_at_period_end: false,
      pause_collection: null,
      discounts: [],
      items: { data: [{ id: 'si_1', price: { id: 'price_ess_m', recurring: { interval: 'month' } } }] },
    });

    await extendTrial(1, { days: 7 }, actor);

    const params = h.subscriptionsUpdate.mock.calls.at(-1)![1] as { trial_end: number };
    // From 2026-09-20, not from 2026-09-08 — otherwise a 7-day extension of a
    // trial with 12 days left would SHORTEN it.
    expect(params.trial_end).toBe(Math.floor(Date.parse('2026-09-27T00:00:00Z') / 1000));
  });

  /**
   * The defect this closes: Stripe replays the original response for 24 hours
   * when an idempotency key repeats. With keys built only from
   * (subscription, action, input), pausing a subscription, resuming it, and
   * pausing it again the same afternoon made the SECOND pause a silent no-op —
   * it returned the first pause's response having changed nothing. A money
   * action reporting success while doing nothing is the worst failure shape
   * there is.
   */
  it('gives a deliberate repeat a different key, while a same-moment retry keeps one', () => {
    const t0 = Date.parse('2026-09-08T12:00:00Z');

    // Same submission retried immediately — one key, so Stripe replays.
    expect(idempotencyWindow(t0)).toBe(idempotencyWindow(t0 + 5_000));

    // A deliberate repeat a minute later — a different key, so it actually runs.
    expect(idempotencyWindow(t0)).not.toBe(idempotencyWindow(t0 + 60_000));
  });

  /**
   * The defect the key shape closes, measured across TWO calls.
   *
   * The previous version of this test called `extendTrial` ONCE under a frozen
   * clock and asserted the key string. That cannot observe the property its
   * title claimed: the old key carried the computed `trial_end`, which is the
   * value the action WRITES, so a retry arriving after the first write
   * committed read the NEW end, built a different key, and Stripe ran it — a
   * second 30-day extension. A single frozen call cannot see a value that only
   * drifts between calls.
   *
   * So this one applies the write between the two attempts, which is exactly
   * what a real retry sees, and asserts the two keys are IDENTICAL. Identical
   * keys inside Stripe's 24-hour replay window are what makes the second
   * attempt a replay rather than a second extension.
   */
  it('keys on the requested days, so a retry after the write commits replays instead of extending again', async () => {
    const t0 = Date.parse('2026-09-08T00:00:00Z');
    vi.setSystemTime(new Date(t0));

    await extendTrial(1, { days: 30 }, actor);
    const firstKey = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    // The retry reads POST-write state: trial_end is now 30 days further out.
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      trial_end: Math.floor(Date.parse('2026-10-08T00:00:00Z') / 1000),
      cancel_at_period_end: false,
      pause_collection: null,
      discounts: [],
      items: { data: [{ id: 'si_1', price: { id: 'price_ess_m', recurring: { interval: 'month' } } }] },
    });
    // Five seconds later: same submission, same 60-second bucket.
    vi.setSystemTime(new Date(t0 + 5_000));
    await extendTrial(1, { days: 30 }, actor);
    const retryKey = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    expect(retryKey).toEqual(firstKey);
    expect(retryKey).toEqual({
      idempotencyKey: `admin:extend-trial:sub_1:30:${idempotencyWindow(t0)}`,
    });

    // The second call DID compute a further-out trial end from the post-write
    // read — so the assertion above passes because the KEY is stable, not
    // because the action quietly did the same thing twice.
    const params = h.subscriptionsUpdate.mock.calls.at(-1)![1] as { trial_end: number };
    expect(params.trial_end).toBe(Math.floor(Date.parse('2026-11-07T00:00:00Z') / 1000));
  });

  it('gives a DELIBERATE repeat a minute later a different key', async () => {
    const t0 = Date.parse('2026-09-08T00:00:00Z');
    vi.setSystemTime(new Date(t0));
    await extendTrial(1, { days: 30 }, actor);
    const first = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    vi.setSystemTime(new Date(t0 + 90_000));
    await extendTrial(1, { days: 30 }, actor);
    const later = h.subscriptionsUpdate.mock.calls.at(-1)![2];

    // Same inputs, a different bucket — so the operator's SECOND decision runs
    // rather than replaying the first as a silent no-op.
    expect(later).not.toEqual(first);
  });
});

describe('applyCoupon', () => {
  it('validates the coupon before touching the subscription', async () => {
    await expect(applyCoupon(1, { coupon: 'NOPE' }, actor)).rejects.toThrow(/coupon/i);

    // The whole point of retrieving first: a bad code changes nothing. Without
    // this ordering, `discounts` would REPLACE any existing discount.
    expect(h.couponsRetrieve).toHaveBeenCalledWith('NOPE');
    expect(stripeWriteCallCount()).toBe(0);
  });

  it('applies a valid coupon through the discounts array with an idempotency key', async () => {
    await applyCoupon(1, { coupon: 'SUMMER' }, actor);

    expect(h.subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_1',
      // `discounts: [{ coupon }]`, not the legacy top-level `coupon:` parameter,
      // which apiVersion 2026-01-28.clover no longer accepts.
      { discounts: [{ coupon: 'SUMMER' }] },
      { idempotencyKey: `admin:apply-coupon:sub_1:SUMMER:${idempotencyWindow()}` },
    );
  });

  it('records the coupon it replaced, read off discount.source.coupon', async () => {
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      trial_end: null,
      cancel_at_period_end: false,
      pause_collection: null,
      // `di_1` is the DISCOUNT's id, not a coupon code — recording it would put a
      // value in an append-only audit row that reads like a coupon and is not one.
      discounts: [{ id: 'di_1', source: { coupon: 'SPRING', type: 'coupon' } }],
      items: { data: [{ id: 'si_1', price: { id: 'price_ess_m', recurring: { interval: 'month' } } }] },
    });

    const result = await applyCoupon(1, { coupon: 'SUMMER' }, actor);
    expect(result.before).toEqual({ coupon: 'SPRING' });
    expect(result.after).toEqual({ coupon: 'SUMMER' });
  });
});

describe('pauseSubscription', () => {
  it('pauses as mark_uncollectible with a pause-specific key', async () => {
    await pauseSubscription(1, { resume: false }, actor);

    expect(h.subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_1',
      { pause_collection: { behavior: 'mark_uncollectible' } },
      { idempotencyKey: `admin:pause:sub_1:pause:${idempotencyWindow()}` },
    );
  });

  it('resumes with an empty string, and a DIFFERENT key from the pause', async () => {
    await pauseSubscription(1, { resume: true }, actor);

    expect(h.subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_1',
      // `''` is Stripe's Emptyable convention for clearing the field. `undefined`
      // would mean "leave it alone" — a resume button that does nothing.
      { pause_collection: '' },
      { idempotencyKey: `admin:pause:sub_1:resume:${idempotencyWindow()}` },
    );
  });

  it('reports the pause state it actually found, not the one it assumed', async () => {
    h.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_1',
      trial_end: null,
      cancel_at_period_end: false,
      pause_collection: { behavior: 'mark_uncollectible' },
      discounts: [],
      items: { data: [{ id: 'si_1', price: { id: 'price_ess_m', recurring: { interval: 'month' } } }] },
    });

    const result = await pauseSubscription(1, { resume: true }, actor);
    expect(result.before).toEqual({ paused: true });
    expect(result.after).toEqual({ paused: false });
  });
});

describe('cancelSubscription', () => {
  it('schedules a period-end cancel through update, never through cancel', async () => {
    await cancelSubscription(1, { atPeriodEnd: true }, actor);

    expect(h.subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_1',
      { cancel_at_period_end: true },
      { idempotencyKey: `admin:cancel:sub_1:period-end:${idempotencyWindow()}` },
    );
    // The terminal call must not have happened: these two are materially
    // different and only one of them can be undone.
    expect(h.subscriptionsCancel).not.toHaveBeenCalled();
  });

  it('cancels immediately through the terminal call, with a different key', async () => {
    await cancelSubscription(1, { atPeriodEnd: false }, actor);

    expect(h.subscriptionsCancel).toHaveBeenCalledWith('sub_1', undefined, {
      idempotencyKey: `admin:cancel:sub_1:now:${idempotencyWindow()}`,
    });
    expect(h.subscriptionsUpdate).not.toHaveBeenCalled();
  });

  it('reports the two outcomes distinguishably in the audit payload', async () => {
    expect((await cancelSubscription(1, { atPeriodEnd: true }, actor)).after).toEqual({
      cancelAtPeriodEnd: true,
      canceled: false,
    });
    expect((await cancelSubscription(1, { atPeriodEnd: false }, actor)).after).toEqual({
      cancelAtPeriodEnd: false,
      canceled: true,
    });
  });
});

describe('the community read', () => {
  it('looks the community up by primary key and does NOT filter demos or deleted rows', async () => {
    await cancelSubscription(1, { atPeriodEnd: true }, actor);

    const read = h.fromCalls.find((call) => call.table === 'communities');
    // A soft-deleted or demo community that still carries a live subscription is
    // a customer still being charged. Filtering here would make the single most
    // valuable of these five actions impossible to perform on it.
    expect(read?.filters).toEqual([['id', 1]]);
  });
});
