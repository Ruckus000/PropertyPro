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
import { and, eq, isNull, sql } from '@propertypro/db/filters';
import type Stripe from 'stripe';
import {
  communities,
  pendingSignups,
  provisioningJobs,
  stripePrices,
  stripeWebhookEvents,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  getStripeClient,
  retrieveCheckoutSession,
  retrieveSubscription,
} from '@/lib/services/stripe-service';
import {
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
} from '@/lib/services/payment-alert-scheduler';
import { runProvisioning, runAddToGroupProvisioning } from '@/lib/services/provisioning-service';
import { processFinanceStripeEvent } from '@/lib/services/finance-service';
import { emitConversionEvent } from '@/lib/services/conversion-events';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grace period reminder offset: Day 23 after cancellation (ms). */
const DAY_23_MS = 23 * 24 * 60 * 60 * 1000;

const STRIPE_WEBHOOK_ERROR_CODES = {
  SECRET_NOT_CONFIGURED: 'STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED',
  SIGNATURE_INVALID: 'STRIPE_WEBHOOK_SIGNATURE_INVALID',
  DUPLICATE_EVENT_PRECHECK: 'STRIPE_WEBHOOK_DUPLICATE_EVENT_PRECHECK',
  DUPLICATE_EVENT_INSERT_FENCE: 'STRIPE_WEBHOOK_DUPLICATE_EVENT_INSERT_FENCE',
  INSERT_FENCE_FAILED: 'STRIPE_WEBHOOK_INSERT_FENCE_FAILED',
  HANDLER_FAILED: 'STRIPE_WEBHOOK_HANDLER_FAILED',
} as const;

type StripeWebhookErrorCode = (typeof STRIPE_WEBHOOK_ERROR_CODES)[keyof typeof STRIPE_WEBHOOK_ERROR_CODES];
type StripeWebhookCategory = 'configuration' | 'validation' | 'idempotency' | 'database' | 'processing';

function logStripeWebhookEvent(
  level: 'info' | 'warn' | 'error',
  message: string,
  input: {
    eventId?: string;
    eventType?: string;
    errorCode?: StripeWebhookErrorCode;
    category?: StripeWebhookCategory;
    metricName?: string;
    outcome?: 'success' | 'failure' | 'duplicate' | 'skipped' | 'retry';
    reason?: string;
    errorMessage?: string;
    payloadSnippet?: Record<string, unknown>;
  },
): void {
  const payload = {
    component: 'stripe-webhook-route',
    message,
    ...input,
  };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn('[stripe-webhook]', payload);
}

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
  eventId: string,
  eventCreatedEpoch: number,
): Promise<void> {
  // add_to_group: existing PM adding a new community to their billing group
  if (session.metadata?.kind === 'add_to_group') {
    const billingGroupId = Number(session.metadata.billingGroupId);
    const pendingSignupId = Number(session.metadata.pendingSignupId);
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as { id: string } | null)?.id;

    if (!stripeSubscriptionId) {
      logStripeWebhookEvent('error', 'add_to_group checkout missing subscription', {
        eventId,
        eventType: 'checkout.session.completed',
        category: 'validation',
        outcome: 'failure',
        payloadSnippet: { sessionId: session.id },
      });
      return;
    }

    void runAddToGroupProvisioning({
      pendingSignupId,
      billingGroupId,
      stripeSubscriptionId,
      stripeCustomerId:
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as { id: string } | null)?.id,
    }).catch((err) => {
      captureException(err, { extra: { pendingSignupId, billingGroupId } });
      logStripeWebhookEvent('error', 'add_to_group provisioning failed', {
        eventId,
        eventType: 'checkout.session.completed',
        category: 'processing',
        outcome: 'failure',
        errorMessage: err instanceof Error ? err.message : String(err),
        payloadSnippet: { pendingSignupId, billingGroupId },
      });
    });

    return;
  }

  const demoId = session.metadata?.demoId;
  const signupRequestId = session.metadata?.signupRequestId;

  if (demoId) {
    const { handleDemoConversion } = await import('@/lib/services/demo-conversion');
    await handleDemoConversion(session, eventId, eventCreatedEpoch);
    return;
  }

  // If an access plan was active when the community subscribed, mark it as converted.
  const accessPlanId = session.metadata?.accessPlanId;
  if (accessPlanId) {
    const { accessPlans } = await import('@propertypro/db');
    const db = createUnscopedClient();
    await db
      .update(accessPlans)
      .set({ convertedAt: new Date() })
      .where(
        and(
          eq(accessPlans.id, Number(accessPlanId)),
          isNull(accessPlans.convertedAt),
          isNull(accessPlans.revokedAt),
        ),
      );
  }

  if (!signupRequestId) {
    // Self-serve subscribe flow (existing community) carries accessPlanId + communityId.
    // Persist Stripe IDs now so later subscription/invoice events can resolve the community.
    const communityIdRaw = session.metadata?.communityId;
    const communityId = communityIdRaw ? Number(communityIdRaw) : null;
    if (accessPlanId && communityId && Number.isFinite(communityId)) {
      const freshSession = await retrieveCheckoutSession(session.id);
      if (freshSession.status !== 'complete') {
        logStripeWebhookEvent('warn', 'self-serve checkout session not yet complete, skipping Stripe ID persistence', {
          eventId,
          eventType: 'checkout.session.completed',
          category: 'validation',
          outcome: 'skipped',
          payloadSnippet: { sessionId: session.id, sessionStatus: freshSession.status, communityId },
        });
        return;
      }
      const stripeCustomerId =
        typeof freshSession.customer === 'string'
          ? freshSession.customer
          : freshSession.customer?.id ?? null;
      const stripeSubscriptionId =
        typeof freshSession.subscription === 'string'
          ? freshSession.subscription
          : (freshSession.subscription as { id: string } | null)?.id ?? null;

      const db = createUnscopedClient();
      const updates: {
        updatedAt: Date;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
      } = { updatedAt: new Date() };
      if (stripeCustomerId) updates.stripeCustomerId = stripeCustomerId;
      if (stripeSubscriptionId) updates.stripeSubscriptionId = stripeSubscriptionId;

      await db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, communityId));
      return;
    }

    if (accessPlanId) return;
    logStripeWebhookEvent('warn', 'checkout.session.completed missing demoId/signupRequestId metadata', {
      eventId,
      eventType: 'checkout.session.completed',
      category: 'validation',
      metricName: 'stripe_webhook_event',
      outcome: 'skipped',
      payloadSnippet: {
        sessionId: session.id,
        hasDemoId: Boolean(demoId),
        hasSignupRequestId: Boolean(signupRequestId),
        hasAccessPlanId: Boolean(accessPlanId),
      },
    });
    return;
  }

  // Fetch fresh state from Stripe [AGENTS #28]
  const freshSession = await retrieveCheckoutSession(session.id);
  if (freshSession.status !== 'complete') {
    return;
  }

  // Extract Stripe billing IDs for provisioning (pattern from demo-conversion.ts)
  const stripeCustomerId =
    typeof freshSession.customer === 'string'
      ? freshSession.customer
      : freshSession.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof freshSession.subscription === 'string'
      ? freshSession.subscription
      : (freshSession.subscription as { id: string } | null)?.id ?? null;

  const db = createUnscopedClient();

  await db
    .update(pendingSignups)
    .set({
      status: 'payment_completed',
      payload: sql`coalesce(${pendingSignups.payload}, '{}'::jsonb) || ${JSON.stringify({ stripeCustomerId, stripeSubscriptionId })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.signupRequestId, signupRequestId));

  // Insert provisioning job stub — onConflictDoNothing handles idempotent re-delivery.
  await db
    .insert(provisioningJobs)
    .values({
      signupRequestId,
      stripeEventId: eventId,
      status: 'initiated',
    })
    .onConflictDoNothing();

  // Look up the job id (may be a newly inserted row or an existing one from a prior delivery).
  const [job] = await db
    .select({ id: provisioningJobs.id })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);

  if (job) {
    // Fire-and-forget: webhook must return 200 immediately. Provisioning is resumable
    // if it fails — the job stays in the DB and can be retried via /api/v1/internal/provision.
    void runProvisioning(job.id).catch((err) => {
      captureException(err, { extra: { signupRequestId } });
    });
  }

  logStripeWebhookEvent('info', 'Provisioning started from checkout.session.completed', {
    eventId,
    eventType: 'checkout.session.completed',
    metricName: 'stripe_webhook_event',
    outcome: 'success',
    payloadSnippet: { signupRequestId, sessionId: session.id },
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  // Fetch fresh state [AGENTS #28]
  const fresh = await retrieveSubscription(subscription.id);
  const db = createUnscopedClient();
  const now = new Date();

  // Look up community by stripeSubscriptionId — needed for name/communityType (email) and to
  // decide which update path to take.
  // [AGENTS #28] retrieveSubscription called for fresh status + price lookup_key
  const existing = await db
    .select({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(eq(communities.stripeSubscriptionId, fresh.id))
    .limit(1);

  const community = existing[0];
  if (!community) return;

  if (fresh.status !== 'canceled') {
    // Non-canceled path: plain UPDATE by community.id, no atomic guard needed.
    const updates: Record<string, unknown> = {
      subscriptionStatus: fresh.status,
      subscriptionPlan:
        fresh.items.data[0]?.price.lookup_key ?? fresh.items.data[0]?.price.id ?? null,
      updatedAt: now,
    };
    if (fresh.status === 'past_due') {
      updates['paymentFailedAt'] = now;
    }
    await db
      .update(communities)
      .set(updates)
      .where(eq(communities.id, community.id));
    return;
  }

  // Canceled path: atomic UPDATE WHERE subscriptionCanceledAt IS NULL RETURNING.
  // If subscription.updated and subscription.deleted both arrive concurrently (different
  // event IDs that both pass the idempotency fence), only the first to acquire the row
  // lock will see subscriptionCanceledAt IS NULL; the loser gets an empty RETURNING and
  // skips the email — preventing double-send.
  const rows = await db
    .update(communities)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: now,
      subscriptionPlan: null,
      nextReminderAt: new Date(now.getTime() + DAY_23_MS), // Day 23
      updatedAt: now,
    })
    .where(
      and(
        eq(communities.id, community.id),
        isNull(communities.subscriptionCanceledAt),
      ),
    )
    .returning({ id: communities.id });

  if (!rows[0]) return; // already canceled — skip email

  await sendSubscriptionCanceledEmail(community.id, {
    communityName: community.name,
    communityType: community.communityType,
    canceledAt: now,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  // [AGENTS #28] Fetch fresh state; [AGENTS #29] guard against out-of-order events.
  const fresh = await retrieveSubscription(subscription.id);
  if (fresh.status !== 'canceled') return;

  const db = createUnscopedClient();
  const now = new Date();

  // Atomic UPDATE: only matches when subscriptionCanceledAt IS NULL.
  // If two concurrent handlers race (subscription.updated + subscription.deleted on different
  // event IDs), PostgreSQL's row lock ensures exactly one wins and gets rows back.
  // The loser gets an empty RETURNING and skips the email — no double-send.
  const rows = await db
    .update(communities)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: now,
      subscriptionPlan: null,
      nextReminderAt: new Date(now.getTime() + DAY_23_MS), // Day 23
      updatedAt: now,
    })
    .where(
      and(
        eq(communities.stripeSubscriptionId, subscription.id),
        isNull(communities.subscriptionCanceledAt),
      ),
    )
    .returning({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
    });

  const community = rows[0];
  if (!community) return; // already canceled or community not found

  await sendSubscriptionCanceledEmail(community.id, {
    communityName: community.name,
    communityType: community.communityType,
    canceledAt: now,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const rawSub = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id ?? null;
  if (!subscriptionId) return;

  const db = createUnscopedClient();
  const now = new Date();
  const nextReminderAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // Day 3

  const communityRows = await db
    .select()
    .from(communities)
    .where(eq(communities.stripeSubscriptionId, subscriptionId))
    .limit(1);

  const community = communityRows[0];
  if (!community) {
    logStripeWebhookEvent('warn', 'invoice.payment_failed has no matching community', {
      eventType: 'invoice.payment_failed',
      category: 'validation',
      metricName: 'stripe_webhook_event',
      outcome: 'skipped',
      payloadSnippet: { subscriptionId },
    });
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

  const amountDue = invoice.amount_due
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        invoice.amount_due / 100,
      )
    : 'unknown amount';

  // Intentional: email fires on every Stripe retry (up to 3-4 per billing cycle).
  // paymentFailedAt and nextReminderAt are preserved from the first failure via ??.
  await sendPaymentFailedEmail(community.id, {
    amountDue,
    lastFourDigits: null,
    communityName: community.name,
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const rawSub = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id ?? null;
  if (!subscriptionId) return;

  const db = createUnscopedClient();

  await db
    .update(communities)
    .set({
      subscriptionStatus: 'active',
      paymentFailedAt: null,
      nextReminderAt: null,
      updatedAt: new Date(),
    })
    .where(eq(communities.stripeSubscriptionId, subscriptionId));
}

async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
  eventId: string,
  eventCreatedEpoch: number,
): Promise<void> {
  const demoId = session.metadata?.demoId;
  if (!demoId) return; // Only track demo-related checkout expirations

  await emitConversionEvent({
    demoId: Number(demoId),
    communityId: session.metadata?.communityId ? Number(session.metadata.communityId) : null,
    eventType: 'checkout_session_expired',
    source: 'stripe_webhook',
    dedupeKey: `stripe:${eventId}`,
    occurredAt: new Date(eventCreatedEpoch * 1000),
    stripeEventId: eventId,
  });
}

// ---------------------------------------------------------------------------
// Event router
// ---------------------------------------------------------------------------

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, event.id, event.created);
      break;
    case 'checkout.session.expired':
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session, event.id, event.created);
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
    case 'price.updated': {
      const price = event.data.object as Stripe.Price;
      if (price.unit_amount !== null) {
        const db = createUnscopedClient();
        await db
          .update(stripePrices)
          .set({ unitAmountCents: price.unit_amount, updatedAt: new Date() })
          .where(eq(stripePrices.stripePriceId, price.id));
      }
      break;
    }
    default:
      // Unhandled event type — safe to ignore
      break;
  }

  // WS-66: Finance payment lifecycle events share the Stripe webhook endpoint.
  await processFinanceStripeEvent(event);
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
    logStripeWebhookEvent('error', 'Stripe webhook secret not configured', {
      errorCode: STRIPE_WEBHOOK_ERROR_CODES.SECRET_NOT_CONFIGURED,
      category: 'configuration',
      metricName: 'stripe_webhook_request',
      outcome: 'failure',
    });
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logStripeWebhookEvent('warn', 'Stripe webhook signature verification failed', {
      errorCode: STRIPE_WEBHOOK_ERROR_CODES.SIGNATURE_INVALID,
      category: 'validation',
      metricName: 'stripe_webhook_request',
      outcome: 'failure',
      errorMessage: err instanceof Error ? err.message : String(err),
      payloadSnippet: { hasSignatureHeader: Boolean(sig), rawBodyLength: rawBody.length },
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Idempotency check — distinguish processed vs failed vs new
  const db = createUnscopedClient();
  const existing = await db
    .select({
      eventId: stripeWebhookEvents.eventId,
      processedAt: stripeWebhookEvents.processedAt,
    })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.id))
    .limit(1);

  const priorAttempt = existing[0];
  let isRetry = false;

  if (priorAttempt) {
    if (priorAttempt.processedAt !== null) {
      // Already processed successfully — true duplicate, skip
      logStripeWebhookEvent('info', 'Stripe webhook duplicate skipped (already processed)', {
        eventId: event.id,
        eventType: event.type,
        errorCode: STRIPE_WEBHOOK_ERROR_CODES.DUPLICATE_EVENT_PRECHECK,
        category: 'idempotency',
        metricName: 'stripe_webhook_event',
        outcome: 'duplicate',
      });
      return NextResponse.json({ received: true });
    }
    // processedAt is null — prior attempt failed, allow retry
    isRetry = true;
    logStripeWebhookEvent('info', 'Stripe webhook retrying previously failed event', {
      eventId: event.id,
      eventType: event.type,
      category: 'idempotency',
      metricName: 'stripe_webhook_event',
      outcome: 'retry',
    });
  }

  // 4. Insert idempotency fence (skip on retry — row already exists)
  if (!isRetry) {
    try {
      await db.insert(stripeWebhookEvents).values({ eventId: event.id });
    } catch (insertErr) {
      if (!isUniqueConstraintError(insertErr)) {
        // Not a unique constraint violation — genuine DB error
        logStripeWebhookEvent('error', 'Stripe webhook fence insert failed', {
          eventId: event.id,
          eventType: event.type,
          errorCode: STRIPE_WEBHOOK_ERROR_CODES.HANDLER_FAILED,
          category: 'processing',
          metricName: 'stripe_webhook_event',
          outcome: 'failure',
        });
        return NextResponse.json({ error: 'Webhook fence insert failed' }, { status: 500 });
      }
      // Unique violation — race condition, another request inserted first
      const [raceCheck] = await db
        .select({ processedAt: stripeWebhookEvents.processedAt })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, event.id))
        .limit(1);

      if (raceCheck && raceCheck.processedAt !== null) {
        return NextResponse.json({ received: true });
      }
      // processedAt is null — another attempt also failed or in progress, continue
    }
  }

  // 5. Process event — catch unexpected errors, log to Sentry, never re-throw
  try {
    await handleStripeEvent(event);
    await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, event.id));
    logStripeWebhookEvent('info', 'Stripe webhook event processed successfully', {
      eventId: event.id,
      eventType: event.type,
      metricName: 'stripe_webhook_event',
      outcome: 'success',
    });
  } catch (err) {
    logStripeWebhookEvent('error', 'Stripe webhook handler failed', {
      eventId: event.id,
      eventType: event.type,
      errorCode: STRIPE_WEBHOOK_ERROR_CODES.HANDLER_FAILED,
      category: 'processing',
      metricName: 'stripe_webhook_event',
      outcome: 'failure',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { extra: { eventType: event.type, eventId: event.id } });
    // processedAt stays null — Stripe will retry on 500
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
};
