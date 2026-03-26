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
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { pendingSignups, stripePrices } from '@propertypro/db';
import type { CommunityType, PlanId } from '@propertypro/shared';
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
  interval: 'month' = 'month',
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
      'BILLING_CONFIG_MISSING',
    );
  }
  return row.stripePriceId;
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
    return_url: `${returnBaseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
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

/** Expose the raw Stripe client for webhook signature verification. */
export function getStripeClient(): Stripe {
  return getStripe();
}
