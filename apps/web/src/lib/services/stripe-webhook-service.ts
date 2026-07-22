import { and, eq, isNull, or, sql } from '@propertypro/db/filters';
import {
  accessPlans,
  communities,
  pendingSignups,
  provisioningJobs,
  stripePrices,
  stripeWebhookEvents,
} from '@propertypro/db';
// AUTHZ: Stripe webhook service — system webhook handlers operate before tenant context is resolved. Callers MUST verify the Stripe webhook signature before invoking these helpers.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface StripeWebhookAttempt {
  eventId: string;
  processedAt: Date | null;
}

export interface StripeWebhookCommunity {
  id: number;
  name: string;
  communityType: string;
  paymentFailedAt?: Date | null;
  nextReminderAt?: Date | null;
}

/**
 * AUTHZ: Caller MUST verify Stripe signature before checking webhook idempotency.
 */
export async function getStripeWebhookAttempt(eventId: string): Promise<StripeWebhookAttempt | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      eventId: stripeWebhookEvents.eventId,
      processedAt: stripeWebhookEvents.processedAt,
    })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, eventId))
    .limit(1);

  return (rows[0] as StripeWebhookAttempt | undefined) ?? null;
}

/**
 * AUTHZ: Caller MUST verify Stripe signature before inserting the webhook fence.
 */
export async function insertStripeWebhookFence(eventId: string): Promise<void> {
  const db = createUnscopedClient();
  await db.insert(stripeWebhookEvents).values({ eventId });
}

/**
 * AUTHZ: Caller MUST verify Stripe signature before marking a webhook event processed.
 */
export async function markStripeWebhookProcessed(eventId: string): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(stripeWebhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(stripeWebhookEvents.eventId, eventId));
}

/**
 * AUTHZ: Caller MUST verify the checkout.session.completed event belongs to Stripe.
 */
export async function markAccessPlanConverted(accessPlanId: number): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(accessPlans)
    .set({ convertedAt: new Date() })
    .where(
      and(
        eq(accessPlans.id, accessPlanId),
        isNull(accessPlans.convertedAt),
        isNull(accessPlans.revokedAt),
      ),
    );
}

/**
 * AUTHZ: Caller MUST verify the checkout.session.completed event belongs to Stripe.
 */
export async function persistSelfServeCommunityStripeIds(input: {
  communityId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** Synced from the same Checkout session so the row isn't left half-written. */
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionCurrentPeriodEndAt?: Date | null;
}): Promise<{ rebindBlocked: boolean }> {
  const db = createUnscopedClient();
  const updates: {
    updatedAt: Date;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionPlan?: string;
    subscriptionCurrentPeriodEndAt?: Date;
  } = { updatedAt: new Date() };
  if (input.stripeCustomerId) updates.stripeCustomerId = input.stripeCustomerId;
  if (input.stripeSubscriptionId) updates.stripeSubscriptionId = input.stripeSubscriptionId;
  if (input.subscriptionStatus) updates.subscriptionStatus = input.subscriptionStatus;
  if (input.subscriptionPlan) updates.subscriptionPlan = input.subscriptionPlan;
  if (input.subscriptionCurrentPeriodEndAt) {
    updates.subscriptionCurrentPeriodEndAt = input.subscriptionCurrentPeriodEndAt;
  }

  // Only bind a subscription id when the row has none, or already names this
  // same one (webhook redelivery). NEVER overwrite a DIFFERENT live id: doing
  // so orphans the previous subscription — every later `customer.subscription.*`
  // event for it resolves to no community and is silently dropped, so
  // cancellation and dunning stop working while the customer keeps being
  // billed for both. Expressed as a WHERE clause rather than a read-then-write
  // so concurrent webhook deliveries can't interleave.
  const rows = await db
    .update(communities)
    .set(updates)
    .where(
      and(
        eq(communities.id, input.communityId),
        input.stripeSubscriptionId
          ? or(
              isNull(communities.stripeSubscriptionId),
              eq(communities.stripeSubscriptionId, input.stripeSubscriptionId),
            )
          : undefined,
      ),
    )
    .returning({ id: communities.id });

  return { rebindBlocked: rows.length === 0 };
}

/**
 * AUTHZ: Caller MUST verify the checkout.session.completed event belongs to Stripe.
 */
export async function markPendingSignupPaymentCompleted(input: {
  signupRequestId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  // A2: carry the trial status + period end so stepCommunityCreated can stamp
  // them onto the community — otherwise the trialing banner is absent during
  // onboarding until a later subscription.updated event happens to arrive.
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEndAt?: Date | null;
}): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(pendingSignups)
    .set({
      status: 'payment_completed',
      payload: sql`coalesce(${pendingSignups.payload}, '{}'::jsonb) || ${JSON.stringify({
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        subscriptionStatus: input.subscriptionStatus ?? null,
        subscriptionCurrentPeriodEndAt: input.subscriptionCurrentPeriodEndAt
          ? input.subscriptionCurrentPeriodEndAt.toISOString()
          : null,
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.signupRequestId, input.signupRequestId));
}

/**
 * AUTHZ: Caller MUST verify the checkout.session.completed event belongs to Stripe.
 */
export async function insertProvisioningJobFence(input: {
  signupRequestId: string;
  stripeEventId: string;
}): Promise<void> {
  const db = createUnscopedClient();
  await db
    .insert(provisioningJobs)
    .values({
      signupRequestId: input.signupRequestId,
      stripeEventId: input.stripeEventId,
      status: 'initiated',
    })
    .onConflictDoNothing();
}

/**
 * AUTHZ: Caller MUST verify the checkout.session.completed event belongs to Stripe.
 */
export async function getProvisioningJobIdBySignupRequestId(signupRequestId: string): Promise<number | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ id: provisioningJobs.id })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);

  return (rows[0] as { id: number } | undefined)?.id ?? null;
}

/**
 * AUTHZ: Caller MUST verify the Stripe subscription event before lookup.
 */
export async function getCommunityByStripeSubscriptionId(
  stripeSubscriptionId: string,
): Promise<StripeWebhookCommunity | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
      paymentFailedAt: communities.paymentFailedAt,
      nextReminderAt: communities.nextReminderAt,
    })
    .from(communities)
    .where(eq(communities.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  return (rows[0] as StripeWebhookCommunity | undefined) ?? null;
}

/**
 * AUTHZ: Caller MUST verify the Stripe subscription event and resolve a canonical plan.
 */
export async function updateCommunitySubscriptionFromStripe(input: {
  communityId: number;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  paymentFailedAt?: Date;
  subscriptionCurrentPeriodEndAt?: Date | null;
}): Promise<void> {
  const db = createUnscopedClient();
  const updates: Record<string, unknown> = {
    subscriptionStatus: input.subscriptionStatus,
    subscriptionPlan: input.subscriptionPlan,
    updatedAt: new Date(),
  };
  if (input.paymentFailedAt) {
    updates['paymentFailedAt'] = input.paymentFailedAt;
  } else if (
    input.subscriptionStatus === 'active' ||
    input.subscriptionStatus === 'trialing'
  ) {
    // Clear the payment-failure marker only when the subscription genuinely
    // RECOVERS (active/trialing). The billing page's payment-failed block is
    // gated on paymentFailedAt while the shell's past_due banner is gated on
    // subscriptionStatus — without this, a subscription.updated → active event
    // (which carries no paymentFailedAt) would let the page block outlive the
    // shell banner. Deliberately NOT cleared on escalation to worse statuses
    // (past_due, unpaid, incomplete_expired) — those are still-failed states
    // that must keep the reminder ladder and payment-failed UI alive.
    updates['paymentFailedAt'] = null;
  }
  if (input.subscriptionCurrentPeriodEndAt !== undefined) {
    updates['subscriptionCurrentPeriodEndAt'] = input.subscriptionCurrentPeriodEndAt;
  }

  await db
    .update(communities)
    .set(updates)
    .where(eq(communities.id, input.communityId));
}

/**
 * AUTHZ: Caller MUST verify the Stripe cancellation event. Atomic guard prevents duplicate cancellation email side effects.
 */
export async function cancelCommunitySubscriptionByIdIfFirst(input: {
  communityId: number;
  canceledAt: Date;
  nextReminderAt: Date;
}): Promise<boolean> {
  const db = createUnscopedClient();
  const rows = await db
    .update(communities)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: input.canceledAt,
      subscriptionPlan: null,
      nextReminderAt: input.nextReminderAt,
      updatedAt: input.canceledAt,
    })
    .where(
      and(
        eq(communities.id, input.communityId),
        isNull(communities.subscriptionCanceledAt),
      ),
    )
    .returning({ id: communities.id });

  return Boolean(rows[0]);
}

/**
 * AUTHZ: Caller MUST verify the Stripe cancellation event. Atomic guard prevents duplicate cancellation email side effects.
 */
export async function cancelCommunitySubscriptionByStripeSubscriptionIfFirst(input: {
  stripeSubscriptionId: string;
  canceledAt: Date;
  nextReminderAt: Date;
}): Promise<StripeWebhookCommunity | null> {
  const db = createUnscopedClient();
  const rows = await db
    .update(communities)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: input.canceledAt,
      subscriptionPlan: null,
      nextReminderAt: input.nextReminderAt,
      updatedAt: input.canceledAt,
    })
    .where(
      and(
        eq(communities.stripeSubscriptionId, input.stripeSubscriptionId),
        isNull(communities.subscriptionCanceledAt),
      ),
    )
    .returning({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
    });

  return (rows[0] as StripeWebhookCommunity | undefined) ?? null;
}

/**
 * AUTHZ: Caller MUST verify the invoice.payment_failed event belongs to Stripe.
 */
export async function markCommunityPaymentFailed(input: {
  community: StripeWebhookCommunity;
  paymentFailedAt: Date;
  nextReminderAt: Date;
}): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({
      subscriptionStatus: 'past_due',
      paymentFailedAt: input.community.paymentFailedAt ?? input.paymentFailedAt,
      nextReminderAt: input.community.nextReminderAt ?? input.nextReminderAt,
      updatedAt: input.paymentFailedAt,
    })
    .where(eq(communities.id, input.community.id));
}

/**
 * AUTHZ: Caller MUST verify the invoice.payment_succeeded event belongs to Stripe.
 */
export async function markCommunityPaymentSucceeded(stripeSubscriptionId: string): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({
      subscriptionStatus: 'active',
      paymentFailedAt: null,
      nextReminderAt: null,
      updatedAt: new Date(),
    })
    .where(eq(communities.stripeSubscriptionId, stripeSubscriptionId));
}

/**
 * AUTHZ: Caller MUST verify the Stripe price.updated event before syncing the global price row.
 */
export async function updateStripePriceUnitAmount(input: {
  stripePriceId: string;
  unitAmountCents: number;
}): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(stripePrices)
    .set({ unitAmountCents: input.unitAmountCents, updatedAt: new Date() })
    .where(eq(stripePrices.stripePriceId, input.stripePriceId));
}
