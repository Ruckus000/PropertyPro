/**
 * Stripe service — P2-34
 *
 * Singleton Stripe client + helpers for checkout session creation and
 * subscription/customer retrieval.
 *
 * Uses createUnscopedClient() for pending_signups updates (pre-tenant context).
 */
import Stripe from 'stripe';
import { eq, and } from '@propertypro/db/filters';
// AUTHZ: P2-34: Stripe integration — pre-tenant context, no communityId available
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { pendingSignups, stripePrices } from '@propertypro/db';
import type { CommunityType, PlanId } from '@propertypro/shared';
import { SIGNUP_TRIAL_DAYS } from '@propertypro/shared';
import type { SignupPlanId } from '@/lib/auth/signup-schema';
import { AppError } from '@/lib/api/errors/AppError';

/** Lazy singleton — initialized on first call. */
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }
  return _stripe;
}

export interface EmbeddedCheckoutResult {
  clientSecret: string;
  sessionId: string;
}

/**
 * Resolve a Stripe Price ID from the stripe_prices table.
 *
 * Replaces the old env-var-based getPriceId() function. All checkout paths
 * (subscribe, admin convert, signup embedded) use this single function.
 */
export async function resolveStripePrice(
  planId: PlanId,
  communityType: CommunityType,
  interval: 'month' | 'year' = 'month',
): Promise<string> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ stripePriceId: stripePrices.stripePriceId })
    .from(stripePrices)
    .where(
      and(
        eq(stripePrices.planId, planId),
        eq(stripePrices.communityType, communityType),
        eq(stripePrices.billingInterval, interval),
      ),
    )
    .limit(1);

  if (!row) {
    throw new AppError(
      `No Stripe price configured for plan=${planId}, communityType=${communityType}, interval=${interval}`,
      500,
      'STRIPE_PRICE_CONFIG_MISSING',
    );
  }
  await assertPriceRetrievable(row.stripePriceId);
  return row.stripePriceId;
}

/**
 * Confirm the configured Stripe key can actually see this price.
 *
 * `stripe_prices` holds ids created in one Stripe mode; the runtime key may be
 * the other mode (test vs live). Querying a live price with a test key — or the
 * reverse — raises `resource_missing`. Without this, the first real upgrade
 * click 500s deep inside checkout with an opaque error. Surface a named,
 * operator-facing failure instead. Re-checked on every call, so it keeps working
 * across key rotations rather than trusting a one-time manual verification.
 */
async function assertPriceRetrievable(priceId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.prices.retrieve(priceId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      throw new AppError(
        `Stripe price ${priceId} is not visible to the configured key — the key and the stored price ids are in different Stripe modes (test vs live). Fix STRIPE_SECRET_KEY or re-seed stripe_prices.`,
        500,
        'STRIPE_MODE_MISMATCH',
      );
    }
    throw err; // network / rate-limit / anything else: surface unchanged.
  }
}

/**
 * Resolve a canonical PlanId from a Stripe Price ID.
 *
 * Inverse of `resolveStripePrice`: maps `stripe_prices.stripe_price_id` → `plan_id`.
 * Used by the `customer.subscription.updated` webhook when `price.lookup_key` is
 * missing (the primary path), so we never write a raw `price_…` string into
 * `communities.subscription_plan`.
 *
 * Throws `STRIPE_PRICE_CONFIG_MISSING` rather than returning null: the webhook
 * caller deliberately lets this bubble so Stripe retries on 500 instead of
 * writing garbage.
 */
export async function resolvePlanIdFromStripePriceId(priceId: string): Promise<PlanId> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ planId: stripePrices.planId })
    .from(stripePrices)
    .where(eq(stripePrices.stripePriceId, priceId))
    .limit(1);

  if (!row) {
    throw new AppError(
      `No Stripe price configured for priceId=${priceId}`,
      500,
      'STRIPE_PRICE_CONFIG_MISSING',
    );
  }
  return row.planId as PlanId;
}

/**
 * Create a Stripe Embedded Checkout session and update pending_signups status.
 *
 * The clientSecret is returned to the client component to mount <EmbeddedCheckout>.
 * Metadata carries the signupRequestId and plan context through to the webhook.
 */
export async function createEmbeddedCheckoutSession(
  signupRequestId: string,
  communityType: CommunityType,
  planId: SignupPlanId,
  candidateSlug: string,
  customerEmail: string,
  returnBaseUrl: string,
): Promise<EmbeddedCheckoutResult> {
  const stripe = getStripe();
  const priceId = await resolveStripePrice(planId, communityType, 'month');

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: customerEmail,
    return_url: `${returnBaseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}&signupRequestId=${encodeURIComponent(signupRequestId)}`,
    subscription_data: {
      trial_period_days: SIGNUP_TRIAL_DAYS,
    },
    metadata: {
      signupRequestId,
      communityType,
      selectedPlan: planId,
      candidateSlug,
    },
  });

  if (!session.client_secret) {
    throw new Error('Stripe did not return a client_secret for embedded checkout');
  }

  // Mark pending signup as checkout_started
  const db = createUnscopedClient();
  await db
    .update(pendingSignups)
    .set({ status: 'checkout_started', updatedAt: new Date() })
    .where(eq(pendingSignups.signupRequestId, signupRequestId));

  return { clientSecret: session.client_secret, sessionId: session.id };
}

/** Retrieve a checkout session with line items and subscription expanded. */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'subscription'],
  });
}

/** Retrieve a subscription with the latest invoice expanded. */
export async function retrieveSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
}

/** Retrieve an invoice. */
export async function retrieveInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return getStripe().invoices.retrieve(invoiceId);
}

/**
 * Resolve the Stripe period end for trial/renewal banners (Stripe API-version
 * tolerant). Prefers `trial_end` (so a trialing sub reports its trial end),
 * then the first item's `current_period_end`, then the legacy top-level field.
 * Shared by the webhook, the trial-stamping step, and the lost-checkout
 * reconciler so all three compute the same value.
 */
export function resolveSubscriptionPeriodEndAt(subscription: Stripe.Subscription): Date | null {
  if (typeof subscription.trial_end === 'number') {
    return new Date(subscription.trial_end * 1000);
  }
  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
  if (typeof itemPeriodEnd === 'number') {
    return new Date(itemPeriodEnd * 1000);
  }
  const legacyPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  if (typeof legacyPeriodEnd === 'number') {
    return new Date(legacyPeriodEnd * 1000);
  }
  return null;
}

/** Create a Stripe Billing Portal session for the given customer. */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Read the active billing interval ('month' | 'year') for a subscription's
 * primary item. Returns null if the subscription has no items or the interval
 * isn't one we support. Used by the billing UI to display "billed monthly"
 * vs "billed annually" without storing it on `communities`.
 */
export async function getActiveSubscriptionInterval(
  subscriptionId: string,
): Promise<'month' | 'year' | null> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  const interval = item?.price.recurring?.interval;
  return interval === 'month' || interval === 'year' ? interval : null;
}

/**
 * Switch an existing subscription to a new price.
 *
 * Updates the first subscription item (PropertyPro subscriptions have one
 * item) and triggers immediate proration via `always_invoice`, so the
 * customer sees the prorated charge or credit on the next invoice now
 * rather than at the end of the period.
 *
 * Sends an idempotency key keyed to `(subscriptionId, newPriceId)` so a
 * concurrent double-submit (e.g. user double-clicks before the form
 * disables) doesn't generate two proration invoices for the same change.
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) {
    throw new AppError(
      `Subscription ${subscriptionId} has no items to update`,
      500,
      'STRIPE_SUBSCRIPTION_NO_ITEMS',
    );
  }
  return stripe.subscriptions.update(
    subscriptionId,
    {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice',
    },
    {
      idempotencyKey: `change-plan:${subscriptionId}:${newPriceId}`,
    },
  );
}

/** Expose the raw Stripe client for webhook signature verification. */
export function getStripeClient(): Stripe {
  return getStripe();
}

/**
 * Create an Embedded Checkout session for a PM adding a community to their
 * existing billing group. No trial (PM is already a paying customer).
 */
export async function createAddCommunityCheckout(input: {
  billingGroupId: number;
  stripeCustomerId: string;
  pendingSignupId: number;
  communityType: CommunityType;
  planId: PlanId;
  candidateSlug: string;
  returnBaseUrl: string;
}): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe();
  const priceId = await resolveStripePrice(input.planId, input.communityType, 'month');

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    customer: input.stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${input.returnBaseUrl}/pm/dashboard/communities?added_session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      kind: 'add_to_group',
      billingGroupId: String(input.billingGroupId),
      pendingSignupId: String(input.pendingSignupId),
      communityType: input.communityType,
      selectedPlan: input.planId,
      candidateSlug: input.candidateSlug,
    },
  });

  if (!session.client_secret) {
    throw new AppError('Stripe did not return client_secret', 500, 'STRIPE_NO_CLIENT_SECRET');
  }

  return { clientSecret: session.client_secret, sessionId: session.id };
}
