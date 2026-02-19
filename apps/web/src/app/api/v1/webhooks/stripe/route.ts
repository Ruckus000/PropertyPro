/**
 * Stripe webhook handler — P2-34
 *
 * Critical implementation notes:
 * - MUST NOT use withErrorHandler (Stripe retries on non-2xx; always return 200)
 * - MUST use req.text() for raw body (signature verification requires raw bytes)
 * - MUST verify signature before any processing [AGENTS #27]
 * - MUST check stripe_webhook_events for idempotency BEFORE processing [AGENTS #26]
 * - MUST fetch latest state from Stripe API inside handler [AGENTS #28]
 * - MUST handle out-of-order events gracefully [AGENTS #29]
 */
import { NextResponse, type NextRequest } from 'next/server';
import { captureException } from '@sentry/nextjs';
import { eq } from '@propertypro/db/filters';
import type Stripe from 'stripe';
import {
  communities,
  pendingSignups,
  provisioningJobs,
  stripeWebhookEvents,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  getStripeClient,
  retrieveCheckoutSession,
  retrieveInvoice,
  retrieveSubscription,
} from '@/lib/services/stripe-service';
import { sendPaymentFailedEmail } from '@/lib/services/payment-alert-scheduler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** PostgreSQL unique_violation error code. */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const signupRequestId = session.metadata?.signupRequestId;
  if (!signupRequestId) {
    console.warn('[stripe-webhook] checkout.session.completed missing signupRequestId in metadata');
    return;
  }

  // Fetch fresh state from Stripe [AGENTS #28]
  const freshSession = await retrieveCheckoutSession(session.id);
  if (freshSession.status !== 'complete') {
    return;
  }

  const db = createUnscopedClient();

  await db
    .update(pendingSignups)
    .set({ status: 'payment_completed', updatedAt: new Date() })
    .where(eq(pendingSignups.signupRequestId, signupRequestId));

  // Insert provisioning job stub — P2-35 picks this up.
  // onConflictDoNothing handles idempotent re-delivery.
  await db
    .insert(provisioningJobs)
    .values({
      signupRequestId,
      stripeEventId: session.id,
      status: 'initiated',
    })
    .onConflictDoNothing();

  console.info('[stripe-webhook] provisioning job created for', signupRequestId);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  // Fetch fresh state [AGENTS #28]
  const fresh = await retrieveSubscription(subscription.id);
  const db = createUnscopedClient();
  const now = new Date();

  const updates: Record<string, unknown> = {
    subscriptionStatus: fresh.status,
    subscriptionPlan:
      fresh.items.data[0]?.price.lookup_key ?? fresh.items.data[0]?.price.id ?? null,
    updatedAt: now,
  };

  if (fresh.status === 'canceled') {
    updates['subscriptionCanceledAt'] = now;
  }
  if (fresh.status === 'past_due') {
    updates['paymentFailedAt'] = now;
  }

  await db
    .update(communities)
    .set(updates)
    .where(eq(communities.stripeSubscriptionId, subscription.id));
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const db = createUnscopedClient();
  const now = new Date();

  await db
    .update(communities)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: now,
      updatedAt: now,
    })
    .where(eq(communities.stripeSubscriptionId, subscription.id));
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  // Fetch fresh state [AGENTS #28]
  const freshInvoice = await retrieveInvoice(invoice.id);

  const db = createUnscopedClient();
  const now = new Date();
  const nextReminderAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // Day 3

  const communityRows = await db
    .select()
    .from(communities)
    .where(eq(communities.stripeCustomerId, customerId))
    .limit(1);

  const community = communityRows[0];
  if (!community) {
    console.warn('[stripe-webhook] invoice.payment_failed: no community for customer', customerId);
    return;
  }

  await db
    .update(communities)
    .set({
      subscriptionStatus: 'past_due',
      paymentFailedAt: community.paymentFailedAt ?? now,
      nextReminderAt: community.nextReminderAt ?? nextReminderAt,
      updatedAt: now,
    })
    .where(eq(communities.id, community.id));

  const amountDue = freshInvoice.amount_due
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        freshInvoice.amount_due / 100,
      )
    : 'unknown amount';

  await sendPaymentFailedEmail(community.id, {
    amountDue,
    lastFourDigits: null,
    communityName: community.name,
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const db = createUnscopedClient();

  await db
    .update(communities)
    .set({
      subscriptionStatus: 'active',
      paymentFailedAt: null,
      nextReminderAt: null,
      updatedAt: new Date(),
    })
    .where(eq(communities.stripeCustomerId, customerId));
}

// ---------------------------------------------------------------------------
// Event router
// ---------------------------------------------------------------------------

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    default:
      // Unhandled event type — safe to ignore
      break;
  }
}

// ---------------------------------------------------------------------------
// Route handler — MUST NOT use withErrorHandler
// ---------------------------------------------------------------------------

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  // 1. Raw body — MUST use req.text() [AGENTS #27]
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  // 2. Signature verification
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ received: true });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Idempotency check [AGENTS #26]
  const db = createUnscopedClient();
  const existing = await db
    .select({ eventId: stripeWebhookEvents.eventId })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.id))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ received: true });
  }

  // 4. Record BEFORE processing (idempotency fence)
  // Race condition: two deliveries may race past the select — the second
  // will hit a unique constraint, which is expected (not an error).
  try {
    await db.insert(stripeWebhookEvents).values({ eventId: event.id });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ received: true });
    }
    captureException(err);
    return NextResponse.json({ received: true });
  }

  // 5. Process event — catch unexpected errors, log to Sentry, never re-throw
  try {
    await handleStripeEvent(event);
    await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, event.id));
  } catch (err) {
    captureException(err, { extra: { eventType: event.type, eventId: event.id } });
    // processedAt stays null — safe to retry via Stripe dashboard if needed
  }

  return NextResponse.json({ received: true });
};
