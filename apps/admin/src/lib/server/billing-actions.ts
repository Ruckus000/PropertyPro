/**
 * The five subscription actions — the only code in this console that moves money.
 *
 * Change plan, extend trial, apply coupon, pause collection, cancel. Each one
 * charges, stops charging, or changes what a real customer is charged, so every
 * safety property below is load-bearing and none of it is ceremony.
 *
 * ## 1. The mode assertion, and why it refuses here
 *
 * Stripe's test and live namespaces are disjoint: a `sub_…` created in one is
 * invisible to the other. The expensive way to learn you are pointed at the
 * wrong one is a `resource_missing` from Stripe; the catastrophic way is for the
 * ids to happen to resolve and the wrong customer to be charged.
 *
 * So before any write:
 *
 *     expected = process.env.STRIPE_EXPECTED_LIVEMODE !== 'false'   // defaults to LIVE
 *     actual   = stripeKeyLivemode(process.env.STRIPE_SECRET_KEY)
 *     actual !== expected  →  refuse
 *
 * Two consequences worth stating plainly:
 *
 *  - **The default expects LIVE.** `docs/LAUNCH-BLOCKERS.md` records this repo's
 *    Stripe as still being in TEST mode, so with `STRIPE_EXPECTED_LIVEMODE`
 *    unset every one of these five actions REFUSES here. That is the correct
 *    direction to fail — an unconfigured deployment must not be able to move
 *    money — and the refusal is the path a reviewer will actually exercise. It is
 *    why the refusal has its own error code and a message that names the
 *    environment variable, and why none of the READS in `billing.ts` are gated
 *    on mode: the console has to keep working in order to show you the mismatch.
 *  - **An unrecognised key refuses too.** `stripeKeyLivemode` returns `null` for
 *    an unset or unparseable key, and `null !== expected` always holds.
 *    `@propertypro/shared`'s own docblock says callers must treat `null` as "do
 *    not gate" — that rule is about the WEBHOOK, where rejecting would drop real
 *    payment traffic. Here the action is a manual operator write, so refusing
 *    costs one retry with the key set, and proceeding risks a charge against an
 *    unknown account. It gets its own code (`STRIPE_MODE_UNKNOWN`) so the screen
 *    can tell "misconfigured" from "wrong mode".
 *
 * ## 2. Idempotency keys: what they do and do not protect
 *
 * Every call passes an explicit `idempotencyKey`. Stripe replays the original
 * response for a repeated key within 24 hours, so a double-submit, a proxy
 * retry, or an operator's second click cannot produce a second charge.
 *
 * **Rule 1, which holds for all five: a key is built from REQUEST INPUT** — the
 * subscription id, the action, and the values the operator actually submitted —
 * and never from a clock, a uuid, a counter, or a value THIS ACTION WRITES.
 * That last clause is not decoration. `extendTrial` used to key on the trial end
 * it was about to set, so a retry arriving after the first write committed
 * re-read the new end, computed a different key, and granted a second
 * extension: a key derived from a value the action writes is self-invalidating,
 * and protects nothing while claiming to. It keys on `input.days` instead. If a
 * key ever needs a value that is not in the request, take it from a field the
 * action does not touch (`changePlan`'s `priceId` resolves from `input.planId`
 * and the subscription's cadence, neither of which it changes).
 *
 * **Rule 2, which is per-action: whether the key carries the 60-second bucket**
 * from `IDEMPOTENCY_WINDOW_MS`. The split is deliberate and the two halves are
 * protecting against opposite harms:
 *
 *  - **`changePlan` — NO window. The key is stable for the whole 24 hours.**
 *    `proration_behavior: 'always_invoice'` bills the difference immediately, so
 *    a duplicate raises a second invoice collected against a real card. Its
 *    payload does not move between attempts, so a stable key genuinely protects.
 *    The accepted cost is that Essentials → Professional → Essentials →
 *    Professional inside one day replays the first move rather than re-applying
 *    it. For money a swallowed re-do is the safe side of that trade, and it is
 *    recoverable from the Stripe dashboard.
 *  - **`extendTrial`, `applyCoupon`, `pauseSubscription`, `cancelSubscription` —
 *    WINDOWED.** None of these charges anybody for a duplicate: re-applying the
 *    same coupon, or setting `pause_collection` to the value it already holds,
 *    changes nothing. So here the SILENT NO-OP is the real harm — pause a
 *    subscription, resume it, pause it again the same afternoon, and without a
 *    bucket the second pause returns the first pause's response having changed
 *    nothing, which is a money action reporting success while doing nothing. The
 *    bucket lets a deliberate repeat actually run, while a retry of ONE
 *    submission (a double-click, a proxy retry) still lands in the same bucket
 *    and still replays.
 *
 * So: do not add a window to `changePlan`, and do not remove one from the other
 * four. Neither is a cleanup. Each is the protection the other side does not
 * need and this side does.
 *
 * ## 3. What is read, what is written
 *
 * Nothing here writes `communities.subscription_plan` / `subscription_status`
 * (spec D17) — Stripe is the source of truth and the web app's webhook owns
 * those columns. Each action re-`retrieve`s the live subscription rather than
 * trusting the five-minute read cache, because a cached `trial_end` or price id
 * used as the basis for a write is how you extend the wrong trial.
 *
 * Each returns `{ before, after }` for the audit row and invalidates the read
 * cache. The audit write itself lives in the ROUTE, after this resolves, so a
 * failed action records nothing — the pattern `leads/route.ts` follows.
 *
 * @module lib/server/billing-actions
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { stripeKeyLivemode } from '@propertypro/shared';
import { AppError, NotFoundError, ValidationError } from '@propertypro/shared/http';

import type Stripe from 'stripe';

import { getStripeClient } from '@/lib/stripe';
import { invalidateBillingCache } from './billing-cache';

/**
 * What the route audits and returns.
 *
 * `before`/`after` carry the CHANGED FIELDS ONLY — not a subscription dump. An
 * audit row is a record of a change, and `platform_admin_audit_log` is
 * append-only, so anything put in here is permanent and uncorrectable.
 */
export interface ActionResult {
  subscriptionId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Days an operator may add to a trial. A free-form number is not offered. */
export type TrialExtensionDays = 7 | 14 | 30;

const MS_PER_DAY = 86_400_000;

/**
 * How long two identical submissions are treated as the SAME request.
 *
 * Stripe replays the original response for 24 hours when an idempotency key
 * repeats. Keys built only from (subscription, action, input) therefore make a
 * DELIBERATE repeat of the same action a silent no-op: pause a subscription,
 * resume it, pause it again the same afternoon, and the second pause returns the
 * first pause's response having changed nothing. A money action that reports
 * success while doing nothing is the worst failure shape available, so four of
 * the five keys carry a coarse time bucket as well.
 *
 * The trade-off, stated rather than hidden: a network retry of one submission
 * replays (which is the protection we want) unless it straddles a bucket
 * boundary, and two genuinely distinct intents inside the same minute collide.
 * Sixty seconds is well inside the double-click and client-retry window and well
 * under any plausible "change my mind" interval. Every action already requires
 * an explicit confirm dialog, so an accidental double submission is a retry of
 * one click rather than two decisions.
 *
 * **`changePlan` deliberately does NOT use this** — it is the one action whose
 * duplicate costs real money, so it keeps one key for Stripe's full 24 hours.
 * See §2 of the module docblock for the whole split; it is per-action on
 * purpose and neither half is a cleanup opportunity.
 */
const IDEMPOTENCY_WINDOW_MS = 60_000;

/** The current replay bucket. Exported for the tests that pin key shape. */
export function idempotencyWindow(now: number = Date.now()): string {
  return String(Math.floor(now / IDEMPOTENCY_WINDOW_MS));
}

/**
 * Refusal when the key's mode is not the mode this deployment declares.
 *
 * 503 with its own code. `withAdminErrorHandler` passes an `AppError` through
 * with `code` and `message` intact, so the UI renders the specific sentence
 * rather than "An unexpected error occurred" — the whole point of not letting
 * this be a generic 500.
 */
export class StripeModeMismatchError extends AppError {
  constructor(actual: boolean, expected: boolean) {
    super(
      `Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE — refusing to change a subscription. ` +
        `STRIPE_SECRET_KEY is a ${actual ? 'live' : 'test'}-mode key and this console expects ` +
        `${expected ? 'live' : 'test'} mode. Set STRIPE_EXPECTED_LIVEMODE=${expected ? 'false' : 'true'} ` +
        `if that is intended, or point STRIPE_SECRET_KEY at the ${expected ? 'live' : 'test'} key.`,
      503,
      'STRIPE_MODE_MISMATCH',
    );
    this.name = 'StripeModeMismatchError';
  }
}

/** Refusal when the key is absent or its prefix is not one Stripe issues. */
export class StripeModeUnknownError extends AppError {
  constructor(expected: boolean) {
    super(
      `STRIPE_SECRET_KEY is unset or its mode could not be determined, and this console expects ` +
        `${expected ? 'live' : 'test'} mode — refusing to change a subscription.`,
      503,
      'STRIPE_MODE_UNKNOWN',
    );
    this.name = 'StripeModeUnknownError';
  }
}

/**
 * Which mode this deployment declares it is pointed at.
 *
 * `STRIPE_EXPECTED_LIVEMODE !== 'false'` — so ONLY the exact string `'false'`
 * opts into test mode, and an unset, empty, misspelled or truthy value means
 * LIVE. The asymmetry is deliberate: the way to get a wrong answer out of this is
 * a typo, and a typo must land on the strict side.
 */
export function getExpectedStripeLivemode(): boolean {
  return process.env.STRIPE_EXPECTED_LIVEMODE !== 'false';
}

/**
 * Throw unless the configured key's mode is the expected one.
 *
 * Called by every action before it touches Stripe. Reads `process.env` on each
 * call rather than at module load, so a key rotation does not require a restart
 * to be noticed — and so a test can set the variables per case.
 */
export function assertStripeActionMode(): void {
  const expected = getExpectedStripeLivemode();
  const actual = stripeKeyLivemode(process.env.STRIPE_SECRET_KEY);
  if (actual === null) throw new StripeModeUnknownError(expected);
  if (actual !== expected) throw new StripeModeMismatchError(actual, expected);
}

interface ActionCommunity {
  id: number;
  name: string;
  community_type: string;
  subscription_plan: string | null;
  stripe_subscription_id: string;
}

/**
 * Load the community an action targets, and prove it has a subscription.
 *
 * The real-community filter is deliberately absent — see the exempt at the read.
 */
async function loadActionCommunity(communityId: number): Promise<ActionCommunity> {
  const db = createAdminClient();
  // admin-community-scope:exempt — single community by PRIMARY KEY, and deliberately NOT filtered to real communities: cancelling the subscription of a soft-deleted or demo community that is still being charged is the single most valuable of these five actions, and a real-community filter here would make exactly that case impossible to fix from the console.
  const { data, error } = await db
    .from('communities')
    .select('id, name, community_type, subscription_plan, stripe_subscription_id')
    .eq('id', communityId)
    .single();

  if (error || !data) throw new NotFoundError('Community not found');

  const row = data as Omit<ActionCommunity, 'stripe_subscription_id'> & {
    stripe_subscription_id: string | null;
  };

  if (!row.stripe_subscription_id) {
    // 400, not 404: the community exists and the request was well-formed; it
    // simply has nothing in Stripe to change. A 404 would read as "wrong id".
    throw new ValidationError('This community has no Stripe subscription.');
  }

  return { ...row, stripe_subscription_id: row.stripe_subscription_id };
}

/**
 * Everything an action needs before it may call Stripe, in one place.
 *
 * The ORDER is the plan's and it is deliberate: load the community, prove it has
 * a subscription, THEN assert the mode. Both refusals happen before any Stripe
 * call, which is the property that matters; doing the cheap env check first would
 * mean a wrong community id in a correctly-configured deployment reported a mode
 * problem instead of a missing community.
 */
async function prepareAction(communityId: number): Promise<ActionCommunity> {
  const community = await loadActionCommunity(communityId);
  assertStripeActionMode();
  return community;
}

/**
 * The live subscription state every action needs, in one retrieve.
 *
 * Deliberately NOT read from the five-minute billing cache. A cached
 * `trial_end`, price id or pause state used as the basis for a write is how you
 * extend the wrong trial or report a `before` value that was already false when
 * the operator clicked. Each action pays for one fresh read.
 *
 * It is also what makes the audit row's `before` a measurement rather than an
 * assumption: without this, `pause`/`cancel`/`applyCoupon` could only record
 * what they intended to change FROM.
 */
interface SubscriptionState {
  itemId: string;
  priceId: string | null;
  interval: 'month' | 'year';
  trialEnd: number | null;
  paused: boolean;
  cancelAtPeriodEnd: boolean;
  /**
   * The live Stripe status.
   *
   * Carried for one reason: `cancelSubscription` used to hard-code
   * `canceled: false` as the audit row's `before`, so cancelling an
   * already-canceled subscription recorded a prior state that was not the prior
   * state. `platform_admin_audit_log` is append-only and uncorrectable, so that
   * is a permanent false record in the one trail linking a charge to an
   * operator. Measured, not assumed.
   */
  status: string;
  /**
   * The first attached coupon's id, or `null`.
   *
   * In this API version the coupon hangs off `discount.source.coupon`, not
   * `discount.coupon` — a `Discount` carries its OWN id (`di_…`), which is a
   * different object. Recording the `di_…` as the previous coupon would put a
   * value in the audit row that reads like a coupon code and is not one.
   */
  couponId: string | null;
}

/**
 * A subscription's attached coupon id, from a `discounts[]` entry.
 *
 * The entry may be an unexpanded `di_…` string (we do not expand), or a
 * `Discount` whose `source.coupon` is itself either a coupon id or an expanded
 * `Coupon`. All three are handled; anything else yields `null` rather than a
 * guess, because this value goes into an append-only audit row.
 */
function couponIdOf(discount: string | Stripe.Discount | undefined): string | null {
  if (discount === undefined) return null;
  if (typeof discount === 'string') return discount;
  const coupon = discount.source?.coupon;
  if (typeof coupon === 'string') return coupon;
  if (coupon && typeof coupon.id === 'string') return coupon.id;
  return null;
}

async function retrieveSubscriptionState(subscriptionId: string): Promise<SubscriptionState> {
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items?.data?.[0];
  if (!item) {
    throw new AppError(
      'That Stripe subscription has no line item to change.',
      502,
      'STRIPE_SUBSCRIPTION_EMPTY',
    );
  }
  const rawInterval = item.price?.recurring?.interval;
  const firstDiscount = (sub.discounts ?? [])[0];

  return {
    itemId: item.id,
    priceId: item.price?.id ?? null,
    // Monthly is the product's only non-annual cadence and the default every
    // signup takes; a weekly/daily price cannot be produced by our own
    // checkout, so treating an unexpected cadence as monthly keeps the price
    // lookup on a row that exists rather than 500ing on a cadence we do not sell.
    interval: rawInterval === 'year' ? 'year' : 'month',
    trialEnd: typeof sub.trial_end === 'number' ? sub.trial_end : null,
    paused: Boolean(sub.pause_collection),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    status: sub.status,
    couponId: couponIdOf(firstDiscount),
  };
}

/**
 * `stripe_prices` → the price id for (plan, community type, current interval).
 *
 * The column is `billing_interval`, not `interval`, and the three together are a
 * unique key (`stripe_prices_plan_community_interval`). The interval is the
 * subscription's CURRENT one: changing a plan must not silently also change a
 * customer from annual to monthly billing.
 *
 * `docs/LAUNCH-BLOCKERS.md` records production's `stripe_prices` as holding TEST
 * price ids. Nothing here tries to reconcile that — it is the cutover's problem,
 * and the mode assertion above is what keeps a mismatched pair from being used.
 */
async function resolvePriceId(
  planId: string,
  communityType: string,
  interval: 'month' | 'year',
): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('stripe_prices')
    .select('stripe_price_id')
    .eq('plan_id', planId)
    .eq('community_type', communityType)
    .eq('billing_interval', interval)
    .single();

  if (error || !data) {
    throw new AppError(
      `No Stripe price is configured for plan=${planId}, communityType=${communityType}, billingInterval=${interval}.`,
      500,
      'STRIPE_PRICE_CONFIG_MISSING',
    );
  }

  return (data as { stripe_price_id: string }).stripe_price_id;
}

/**
 * Move the subscription onto another plan's price, at the same cadence.
 *
 * `proration_behavior: 'always_invoice'` bills the difference immediately, which
 * is what makes this an action that moves money rather than one that schedules a
 * change — and what makes the idempotency key matter: a replayed request would
 * otherwise produce a second proration invoice.
 */
export async function changePlan(
  communityId: number,
  input: { planId: string },
): Promise<ActionResult> {
  const community = await prepareAction(communityId);
  const subscriptionId = community.stripe_subscription_id;

  const item = await retrieveSubscriptionState(subscriptionId);
  const priceId = await resolvePriceId(input.planId, community.community_type, item.interval);

  const stripe = getStripeClient();
  await stripe.subscriptions.update(
    subscriptionId,
    {
      items: [{ id: item.itemId, price: priceId }],
      proration_behavior: 'always_invoice',
    },
    // NO window — see §2. A duplicate here raises a second proration invoice,
    // so the key must stay identical for Stripe's full 24-hour replay period.
    { idempotencyKey: `admin:change-plan:${subscriptionId}:${priceId}` },
  );

  invalidateBillingCache();

  return {
    subscriptionId,
    before: { plan: community.subscription_plan, priceId: item.priceId },
    after: { plan: input.planId, priceId, interval: item.interval },
  };
}

/**
 * Push the trial end out by N days from the LATER of now and the current end.
 *
 * "From the later of" is the whole subtlety. Adding days to an ALREADY-PASSED
 * trial end produces a date in the past, which Stripe reads as "end the trial
 * now" — the opposite of the operator's intent, on the exact case (an expired
 * trial) where they are most likely to reach for this button.
 *
 * The arithmetic is elapsed MILLISECONDS, never a calendar add: a date-fns
 * `addDays` across a DST boundary produces a 13- or 15-day extension (see
 * `packages/shared/src/compliance/posting-deadline.ts`).
 *
 * `proration_behavior: 'none'` — extending a trial must not invoice anybody.
 */
export async function extendTrial(
  communityId: number,
  input: { days: TrialExtensionDays },
): Promise<ActionResult> {
  const community = await prepareAction(communityId);
  const subscriptionId = community.stripe_subscription_id;

  const item = await retrieveSubscriptionState(subscriptionId);
  const currentTrialEndMs = item.trialEnd === null ? null : item.trialEnd * 1000;
  const baseMs = Math.max(Date.now(), currentTrialEndMs ?? 0);
  const trialEnd = Math.floor((baseMs + input.days * MS_PER_DAY) / 1000);

  const stripe = getStripeClient();
  await stripe.subscriptions.update(
    subscriptionId,
    { trial_end: trialEnd, proration_behavior: 'none' },
    // `input.days`, NOT `trialEnd` — see §2. `trialEnd` is the value this call
    // is about to WRITE, so a retry arriving after the first write committed
    // read the new end, computed a different key, and extended a second time.
    { idempotencyKey: `admin:extend-trial:${subscriptionId}:${input.days}:${idempotencyWindow()}` },
  );

  invalidateBillingCache();

  return {
    subscriptionId,
    before: { trialEndsAt: item.trialEnd === null ? null : new Date(item.trialEnd * 1000).toISOString() },
    after: { trialEndsAt: new Date(trialEnd * 1000).toISOString(), daysAdded: input.days },
  };
}

/**
 * Attach a coupon to the subscription.
 *
 * The coupon is RETRIEVED first, and that ordering is the feature: an unknown
 * code sent straight to `subscriptions.update` is a Stripe error deep inside a
 * write, and `discounts` REPLACES the subscription's discount list — so a typo'd
 * code that Stripe happened to accept as an empty set would silently strip an
 * existing discount. Validating first turns that into a 400 that changes nothing.
 *
 * `discounts: [{ coupon }]` is the shape for apiVersion `2026-01-28.clover`; the
 * legacy top-level `coupon:` parameter is gone.
 */
export async function applyCoupon(
  communityId: number,
  input: { coupon: string },
): Promise<ActionResult> {
  const community = await prepareAction(communityId);
  const subscriptionId = community.stripe_subscription_id;

  const state = await retrieveSubscriptionState(subscriptionId);
  const stripe = getStripeClient();

  try {
    await stripe.coupons.retrieve(input.coupon);
  } catch {
    // Deliberately does not forward Stripe's message: for a lookup by a
    // caller-supplied id, Stripe's own text adds nothing the operator can act
    // on, and the only distinction that matters ("no such coupon") is here.
    throw new ValidationError(`No Stripe coupon exists with the id "${input.coupon}".`);
  }

  await stripe.subscriptions.update(
    subscriptionId,
    { discounts: [{ coupon: input.coupon }] },
    { idempotencyKey: `admin:apply-coupon:${subscriptionId}:${input.coupon}:${idempotencyWindow()}` },
  );

  invalidateBillingCache();

  return {
    subscriptionId,
    before: { coupon: state.couponId },
    after: { coupon: input.coupon },
  };
}

/**
 * Pause or resume collection.
 *
 * `mark_uncollectible` rather than `keep_as_draft` or `void`: the subscription
 * keeps its cycle and its history, invoices keep being generated, and they are
 * marked as money we have decided not to chase. That is what an operator means
 * by "pause" for a community in a dispute, and it is reversible.
 *
 * Resume is `pause_collection: ''` — Stripe's `Emptyable` convention for
 * clearing the field. `null` would be rejected by the types and `undefined`
 * would silently mean "do not change it", which is the quiet way a resume
 * button does nothing.
 */
export async function pauseSubscription(
  communityId: number,
  input: { resume: boolean },
): Promise<ActionResult> {
  const community = await prepareAction(communityId);
  const subscriptionId = community.stripe_subscription_id;

  const state = await retrieveSubscriptionState(subscriptionId);
  const stripe = getStripeClient();
  await stripe.subscriptions.update(
    subscriptionId,
    { pause_collection: input.resume ? '' : { behavior: 'mark_uncollectible' } },
    {
      idempotencyKey: `admin:pause:${subscriptionId}:${input.resume ? 'resume' : 'pause'}:${idempotencyWindow()}`,
    },
  );

  invalidateBillingCache();

  return {
    subscriptionId,
    before: { paused: state.paused },
    after: { paused: !input.resume },
  };
}

/**
 * Cancel — at period end, or immediately.
 *
 * The two are different Stripe calls, not one call with a flag.
 * `cancel_at_period_end: true` is an UPDATE and is reversible from the dashboard;
 * `subscriptions.cancel` is terminal and stops the subscription mid-period. The
 * route requires `confirm: true` for both, and the UI distinguishes them, because
 * only one of them can be undone.
 */
export async function cancelSubscription(
  communityId: number,
  input: { atPeriodEnd: boolean },
): Promise<ActionResult> {
  const community = await prepareAction(communityId);
  const subscriptionId = community.stripe_subscription_id;

  const state = await retrieveSubscriptionState(subscriptionId);
  const stripe = getStripeClient();
  const idempotencyKey = `admin:cancel:${subscriptionId}:${input.atPeriodEnd ? 'period-end' : 'now'}:${idempotencyWindow()}`;

  if (input.atPeriodEnd) {
    await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey },
    );
  } else {
    await stripe.subscriptions.cancel(subscriptionId, undefined, { idempotencyKey });
  }

  invalidateBillingCache();

  return {
    subscriptionId,
    // `state.status`, never the literal `false`: cancelling a subscription that
    // is ALREADY canceled must not record "it was not canceled" in a row that
    // can never be corrected.
    before: { cancelAtPeriodEnd: state.cancelAtPeriodEnd, canceled: state.status === 'canceled' },
    after: input.atPeriodEnd
      ? { cancelAtPeriodEnd: true, canceled: false }
      : { cancelAtPeriodEnd: false, canceled: true },
  };
}
