/**
 * GA-gate E2E — what happens on day 30, when the free trial ends and the
 * customer is charged for the first time.
 *
 * `signup-trialing.spec.ts` stops the moment the community reaches `trialing`.
 * Everything after that — the trial expiring, the first REAL invoice, the
 * transition to `active` — had never been exercised by anything, and it is the
 * next moment a customer's money actually moves. It is also served by the same
 * `invoice.payment_succeeded` handler that was writing a hardcoded `'active'`
 * and ending trials early (see docs/signup-checkout-provisioning.md §2.2), so
 * leaving it untested would leave that fix unproven in the direction that
 * matters: a $0 trial invoice must NOT end the trial, and a real one MUST.
 *
 * ── Why this spec mints its own Checkout Session ──
 * Stripe **test clocks** can only be attached to a customer at creation time,
 * and `createEmbeddedCheckoutSession` passes `customer_email`, letting Stripe
 * create the customer itself. There is no way to inject a clock-backed customer
 * without changing production code, which a test must not do. So this spec
 * builds a Checkout Session with the SAME shape the app builds — same price,
 * same `trial_period_days`, same `metadata.signupRequestId` — differing only in
 * `customer` instead of `customer_email`.
 *
 * Nothing in OUR code is bypassed by that: the webhook receives a genuine
 * `checkout.session.completed` carrying our metadata, and provisioning runs
 * exactly as in production. The signup row itself is created through the real
 * `/api/v1/auth/signup` route.
 *
 * GUARDED like its siblings: skips unless `E2E_STRIPE=1` and the test-mode
 * Stripe + Supabase service-role secrets are set.
 */
import { expect, test } from '@playwright/test';
import Stripe from 'stripe';
import {
  STRIPE_E2E_ENV,
  STRIPE_E2E_SKIP_REASON,
  assertSafeStripeE2eTarget,
  buildSignupInputs,
  confirmSupabaseEmail,
  fillHostedStripeCheckout,
  readCommunityBillingBySlug,
  stripeE2eConfigured,
  submitSignupViaApi,
} from './helpers/stripe-e2e';

/** Trial length the app configures (`SIGNUP_TRIAL_DAYS`); advance past it. */
const TRIAL_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

test.describe('Trial end → first real charge (GA gate)', () => {
  test.skip(!stripeE2eConfigured(), STRIPE_E2E_SKIP_REASON);

  test('a trial that expires becomes active without losing its plan', async ({ page, request }) => {
    assertSafeStripeE2eTarget();
    // A clock advance is a batch job on Stripe's side: it settles in tens of
    // seconds, and the webhooks it emits arrive afterwards.
    test.setTimeout(600_000);

    const stripe = new Stripe(STRIPE_E2E_ENV.stripeSecret as string);
    const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const inputs = buildSignupInputs(runId);

    // 1. Real signup + email confirmation, through the real routes.
    const signupRequestId = await submitSignupViaApi(request, inputs);
    await confirmSupabaseEmail(inputs.email);
    const confirm = await request.post('/api/v1/auth/confirm-verification', {
      data: { signupRequestId },
    });
    expect(confirm.ok(), 'confirm-verification failed').toBeTruthy();

    // 2. A customer pinned to a test clock frozen at "now".
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `trial-end ${runId}`,
    });
    const customer = await stripe.customers.create({
      email: inputs.email,
      test_clock: clock.id,
    });

    // 3. The same session the app would build, for that customer. Resolved by
    //    lookup_key so it stays in step with `seed-stripe-test-prices.ts`
    //    rather than hardcoding an id that differs per Stripe account.
    const prices = await stripe.prices.list({
      lookup_keys: [`${inputs.planKey}_${inputs.communityType}_monthly`],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    expect(price, 'no test-mode price — run scripts/seed-stripe-test-prices.ts').toBeTruthy();

    const baseUrl = test.info().project.use.baseURL as string;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: price!.id, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${baseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}&signupRequestId=${encodeURIComponent(signupRequestId)}`,
      cancel_url: `${baseUrl}/signup/checkout?signupRequestId=${encodeURIComponent(signupRequestId)}`,
      metadata: {
        signupRequestId,
        communityType: inputs.communityType,
        selectedPlan: inputs.planKey,
        candidateSlug: inputs.candidateSlug,
      },
    });

    // 4. Pay on Stripe's hosted page. Same Checkout app as the embedded flow,
    //    so the field ids are shared — see `fillHostedStripeCheckout`.
    await page.goto(session.url as string, { waitUntil: 'domcontentloaded' });
    await fillHostedStripeCheckout(page);

    // 5. Provisioning lands the community trialing, via the real webhook.
    await expect(page).toHaveURL(/\/signup\/checkout\/return/, { timeout: 60_000 });
    await expect(page.getByText(/free trial active/i)).toBeVisible({ timeout: 180_000 });

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (await stripe.checkout.sessions.retrieve(session.id)).subscription;
    const subId = typeof subscriptionId === 'string' ? subscriptionId : subscriptionId?.id;
    expect(subId, 'checkout session produced no subscription').toBeTruthy();

    const trialing = await stripe.subscriptions.retrieve(subId as string);
    expect(trialing.status, 'subscription should start out trialing').toBe('trialing');

    // 6. Jump past the end of the trial. Stripe ends the trial, issues the
    //    first REAL (non-zero) invoice, charges the card, and emits the
    //    subscription/invoice webhooks — the exact sequence a customer hits on
    //    day 30, compressed into one call.
    await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: Math.floor(Date.now() / 1000) + (TRIAL_DAYS + 1) * DAY_SECONDS,
    });

    await expect
      .poll(
        async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status,
        { timeout: 300_000, message: 'test clock never finished advancing' },
      )
      .toBe('ready');

    // 7. Stripe's own view: trial over, charged, active.
    await expect
      .poll(async () => (await stripe.subscriptions.retrieve(subId as string)).status, {
        timeout: 120_000,
        message: 'subscription never left trialing after the clock passed trial end',
      })
      .toBe('active');

    // 8. OUR database must agree — and must still know which plan was bought.
    //
    // Read from the database, not the UI: `subscription_plan` is not rendered
    // anywhere, so a plan lost at trial end looks perfectly normal on screen and
    // only surfaces later as unexplained plan gating. That is exactly how the
    // null-plan communities went unnoticed in production.
    //
    // The plan assertion is the load-bearing one. Both
    // `invoice.payment_succeeded` and `customer.subscription.updated` write the
    // community row at trial end, and a handler that stamps a status without
    // carrying the plan is the same class of bug. A customer whose trial
    // converts must not silently lose access to what they now pay for.
    await expect
      .poll(async () => (await readCommunityBillingBySlug(inputs.candidateSlug))?.subscriptionStatus, {
        timeout: 180_000,
        message: 'the community never moved to active after the trial ended',
      })
      .toBe('active');

    const billing = await readCommunityBillingBySlug(inputs.candidateSlug);
    expect(
      billing?.subscriptionPlan,
      'the purchased plan must survive the trial→active transition',
    ).toBe(inputs.planKey);

    // 9. The stored period end must be the NEXT renewal, not the trial end.
    //
    // Stripe leaves `trial_end` populated after a trial converts, so a resolver
    // that prefers it unconditionally stores a date in the past — and keeps
    // storing it, because every later renewal recomputes the same value. That
    // is invisible in the database (a date is a date) and only shows up as a
    // renewal date that has already gone by. Compared against Stripe's own
    // number rather than an expected literal, so the assertion stays true
    // whenever this runs.
    const converted = await stripe.subscriptions.retrieve(subId as string);
    const expectedPeriodEnd = converted.items.data[0]?.current_period_end;
    expect(expectedPeriodEnd, 'converted subscription has no period end').toBeTruthy();
    expect(
      billing?.subscriptionCurrentPeriodEndAt
        ? Math.floor(new Date(billing.subscriptionCurrentPeriodEndAt).getTime() / 1000)
        : null,
      'the stored period end must track the real renewal date, not the elapsed trial end',
    ).toBe(expectedPeriodEnd);
  });
});
