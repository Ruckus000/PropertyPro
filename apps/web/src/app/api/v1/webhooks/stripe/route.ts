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
import type Stripe from 'stripe';
import {
  getStripeClient,
  resolvePlanIdFromStripePriceId,
  resolveSubscriptionPeriodEndAt,
  retrieveCheckoutSession,
  retrieveSubscription,
} from '@/lib/services/stripe-service';
import {
  GRACE_EXPIRY_WARNING_OFFSET_DAYS,
  PAID_GRACE_DAYS,
  PLAN_IDS,
  type PlanId,
} from '@propertypro/shared';
import {
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
} from '@/lib/services/payment-alert-scheduler';
import { runProvisioning, runAddToGroupProvisioning } from '@/lib/services/provisioning-service';
import { processFinanceStripeEvent } from '@/lib/services/finance-service';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import {
  cancelCommunitySubscriptionByIdIfFirst,
  cancelCommunitySubscriptionByStripeSubscriptionIfFirst,
  getCommunityByStripeSubscriptionId,
  getProvisioningJobIdBySignupRequestId,
  getStripeWebhookAttempt,
  insertProvisioningJobFence,
  insertStripeWebhookFence,
  markAccessPlanConverted,
  markCommunityPaymentFailed,
  markCommunityPaymentSucceeded,
  markPendingSignupPaymentCompleted,
  markStripeWebhookProcessed,
  persistSelfServeCommunityStripeIds,
  updateCommunitySubscriptionFromStripe,
  updateStripePriceUnitAmount,
} from '@/lib/services/stripe-webhook-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grace period reminder: two days before the paid grace window ends. */
const GRACE_EXPIRY_WARNING_DELAY_MS =
  (PAID_GRACE_DAYS - GRACE_EXPIRY_WARNING_OFFSET_DAYS) * 24 * 60 * 60 * 1000;

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
    await markAccessPlanConverted(Number(accessPlanId));
  }

  if (!signupRequestId) {
    // Self-serve subscribe flow (existing community) carries communityId, and
    // OPTIONALLY accessPlanId when a free-access grant was active.
    //
    // Persistence is gated on communityId ALONE — deliberately not on
    // accessPlanId. Every later `customer.subscription.*` event resolves its
    // community via `getCommunityByStripeSubscriptionId` and silently returns
    // when there is no match, so skipping this write means the customer is
    // charged and never receives the plan. Most self-serve upgrades have no
    // access plan at all; requiring one here dropped them on the floor.
    const communityIdRaw = session.metadata?.communityId;
    const communityId = communityIdRaw ? Number(communityIdRaw) : null;
    // Integer, not merely finite: this value goes into `WHERE id = $1`, and
    // "1.5"/"1e3" are finite but are not row ids.
    if (communityId !== null && Number.isInteger(communityId) && communityId > 0) {
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

      // Stamp status/plan from THIS session, not just the two IDs. Stripe does
      // not guarantee ordering between `checkout.session.completed` and
      // `customer.subscription.created`; when the subscription event lands
      // first, `handleSubscriptionUpdated` finds no community (the link below
      // doesn't exist yet) and silently returns, and nothing re-stamps until
      // the next renewal a month later. Writing status+plan here closes that
      // window — the customer would otherwise be charged while the app still
      // showed "no plan".
      const subscriptionObject =
        freshSession.subscription && typeof freshSession.subscription !== 'string'
          ? (freshSession.subscription as Stripe.Subscription)
          : null;
      const metadataPlan = session.metadata?.planId ?? null;

      const { rebindBlocked } = await persistSelfServeCommunityStripeIds({
        communityId,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus: subscriptionObject?.status ?? null,
        subscriptionPlan: metadataPlan,
        subscriptionCurrentPeriodEndAt: subscriptionObject
          ? resolveSubscriptionPeriodEndAt(subscriptionObject)
          : null,
      });

      if (rebindBlocked) {
        // The community already points at a DIFFERENT subscription. Refusing
        // the write is correct (see persistSelfServeCommunityStripeIds), but it
        // means a duplicate subscription now exists in Stripe and is billing
        // the customer with nothing in our DB pointing at it. Needs a human.
        const err = new Error(
          `Refused to rebind community ${communityId} to ${stripeSubscriptionId}: a different subscription is already linked. Possible duplicate subscription in Stripe.`,
        );
        captureException(err, {
          extra: { communityId, stripeSubscriptionId, sessionId: session.id },
        });
        logStripeWebhookEvent('error', 'self-serve checkout would rebind an existing subscription', {
          eventId,
          eventType: 'checkout.session.completed',
          category: 'processing',
          outcome: 'failure',
          errorMessage: err.message,
          payloadSnippet: { communityId, stripeSubscriptionId, sessionId: session.id },
        });
      }
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

  // A2: retrieveCheckoutSession expands `subscription`, so when this is a
  // subscription-mode checkout we have the full object here. Capture the trial
  // status + period end so provisioning stamps the community and the trialing
  // banner renders during onboarding.
  const subscriptionObject =
    freshSession.subscription && typeof freshSession.subscription !== 'string'
      ? (freshSession.subscription as Stripe.Subscription)
      : null;
  const subscriptionStatus = subscriptionObject?.status ?? null;
  const subscriptionCurrentPeriodEndAt = subscriptionObject
    ? resolveSubscriptionPeriodEndAt(subscriptionObject)
    : null;

  await markPendingSignupPaymentCompleted({
    signupRequestId,
    stripeCustomerId,
    stripeSubscriptionId,
    subscriptionStatus,
    subscriptionCurrentPeriodEndAt,
  });

  // Insert provisioning job stub — onConflictDoNothing handles idempotent re-delivery.
  await insertProvisioningJobFence({ signupRequestId, stripeEventId: eventId });

  // Look up the job id (may be a newly inserted row or an existing one from a prior delivery).
  const jobId = await getProvisioningJobIdBySignupRequestId(signupRequestId);

  if (jobId !== null) {
    // Await the resumable state machine so serverless cannot drop the work after
    // the webhook returns. On failure, the outer handler returns 500 and Stripe retries.
    await runProvisioning(jobId);
  }

  logStripeWebhookEvent('info', 'Provisioning completed from checkout.session.completed', {
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
  const now = new Date();

  // Look up community by stripeSubscriptionId — needed for name/communityType (email) and to
  // decide which update path to take.
  // [AGENTS #28] retrieveSubscription called for fresh status + price lookup_key
  const community = await getCommunityByStripeSubscriptionId(fresh.id);
  if (!community) return;

  if (fresh.status !== 'canceled') {
    // Non-canceled path: plain UPDATE by community.id, no atomic guard needed.
    // Resolve the canonical PlanId before writing. We must NEVER write a raw
    // price.id into subscription_plan — downstream resolvePlanId() returns null
    // for price IDs, causing plan gates to fail open silently.
    //
    // Primary: price.lookup_key if it's a canonical PlanId.
    // Fallback: resolvePlanIdFromStripePriceId looks up our stripe_prices table.
    // If neither works, the AppError bubbles → 500 to Stripe, triggering a retry.
    const priceItem = fresh.items.data[0]?.price;
    const lookupKey = priceItem?.lookup_key ?? null;
    const priceId = priceItem?.id ?? null;

    let resolvedPlan: PlanId | null;
    if (lookupKey && PLAN_IDS.includes(lookupKey as PlanId)) {
      resolvedPlan = lookupKey as PlanId;
    } else if (priceId) {
      resolvedPlan = await resolvePlanIdFromStripePriceId(priceId);
    } else {
      resolvedPlan = null;
    }

    await updateCommunitySubscriptionFromStripe({
      communityId: community.id,
      subscriptionStatus: fresh.status,
      subscriptionPlan: resolvedPlan,
      paymentFailedAt: fresh.status === 'past_due' ? now : undefined,
      subscriptionCurrentPeriodEndAt: resolveSubscriptionPeriodEndAt(fresh),
    });
    return;
  }

  // Canceled path: atomic UPDATE WHERE subscriptionCanceledAt IS NULL RETURNING.
  // If subscription.updated and subscription.deleted both arrive concurrently (different
  // event IDs that both pass the idempotency fence), only the first to acquire the row
  // lock will see subscriptionCanceledAt IS NULL; the loser gets an empty RETURNING and
  // skips the email — preventing double-send.
  const wasFirstCancellation = await cancelCommunitySubscriptionByIdIfFirst({
    communityId: community.id,
    canceledAt: now,
    nextReminderAt: new Date(now.getTime() + GRACE_EXPIRY_WARNING_DELAY_MS), // Day 5
  });

  if (!wasFirstCancellation) return; // already canceled — skip email

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

  const now = new Date();

  // Atomic UPDATE: only matches when subscriptionCanceledAt IS NULL.
  // If two concurrent handlers race (subscription.updated + subscription.deleted on different
  // event IDs), PostgreSQL's row lock ensures exactly one wins and gets rows back.
  // The loser gets an empty RETURNING and skips the email — no double-send.
  const community = await cancelCommunitySubscriptionByStripeSubscriptionIfFirst({
    stripeSubscriptionId: subscription.id,
    canceledAt: now,
    nextReminderAt: new Date(now.getTime() + GRACE_EXPIRY_WARNING_DELAY_MS), // Day 5
  });
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

  const now = new Date();
  const nextReminderAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // Day 3

  const community = await getCommunityByStripeSubscriptionId(subscriptionId);
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

  await markCommunityPaymentFailed({
    community,
    paymentFailedAt: now,
    nextReminderAt,
  });

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

  await markCommunityPaymentSucceeded(subscriptionId);
}

/**
 * A8: a subscription renewal requires off-session SCA/3DS authentication. Stripe
 * fires `invoice.payment_action_required` BEFORE the payment ultimately fails to
 * `past_due`. Previously unhandled — so the customer only saw a generic
 * "payment failed" later with no authenticate affordance. We resolve the
 * community and notify billing admins so they can authenticate in time.
 *
 * Fast-follow: a dedicated "authenticate your card" email template linking
 * `invoice.hosted_invoice_url` (this reuses the payment-failed notification infra).
 */
async function handleInvoicePaymentActionRequired(invoice: Stripe.Invoice): Promise<void> {
  const rawSub = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id ?? null;
  if (!subscriptionId) return;

  const community = await getCommunityByStripeSubscriptionId(subscriptionId);
  if (!community) {
    logStripeWebhookEvent('warn', 'invoice.payment_action_required has no matching community', {
      eventType: 'invoice.payment_action_required',
      category: 'validation',
      metricName: 'stripe_webhook_event',
      outcome: 'skipped',
      payloadSnippet: { subscriptionId },
    });
    return;
  }

  const amountDue = invoice.amount_due
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        invoice.amount_due / 100,
      )
    : 'your subscription payment';

  await sendPaymentFailedEmail(community.id, {
    amountDue,
    lastFourDigits: null,
    communityName: community.name,
  });
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
    case 'customer.subscription.created':
      // A2(b): belt-and-suspenders for the trial stamp. The non-canceled path of
      // handleSubscriptionUpdated stamps status/plan/period-end via
      // updateCommunitySubscriptionFromStripe, and no-ops when the community isn't
      // linked yet (out-of-order delivery before stepCommunityCreated). Self-heals
      // self-serve subscribes and any late-arriving stamps.
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_action_required':
      await handleInvoicePaymentActionRequired(event.data.object as Stripe.Invoice);
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
        await updateStripePriceUnitAmount({
          stripePriceId: price.id,
          unitAmountCents: price.unit_amount,
        });
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
  const priorAttempt = await getStripeWebhookAttempt(event.id);
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
      await insertStripeWebhookFence(event.id);
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
      const raceCheck = await getStripeWebhookAttempt(event.id);

      if (raceCheck && raceCheck.processedAt !== null) {
        return NextResponse.json({ received: true });
      }
      // processedAt is null — another attempt also failed or in progress, continue
    }
  }

  // 5. Process event — catch unexpected errors, log to Sentry, never re-throw
  try {
    await handleStripeEvent(event);
    await markStripeWebhookProcessed(event.id);
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
