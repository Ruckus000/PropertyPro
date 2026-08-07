/**
 * POST /api/v1/subscribe
 *
 * Smart subscribe route — creates a Stripe checkout session for a community's
 * FIRST subscription (or a re-subscribe after cancellation, which nulls
 * `subscriptionPlan`). Tier/interval switches for an already-active
 * subscription go to `/api/v1/subscribe/change-plan` instead.
 *
 * If the community has an active/in_grace access plan, marks it as converted
 * after successful checkout (via Stripe webhook metadata).
 *
 * Reauth is required only for a RE-subscribe (the community already has a
 * `stripeCustomerId`). A first-ever purchase has no billing identity to
 * protect and no card on file, so a password prompt there would guard nothing
 * and only add friction to the funnel.
 *
 * A re-subscribe is different, and the naive "nothing is charged until the
 * user enters a card" reasoning does NOT hold for it: the session attaches the
 * EXISTING Stripe customer, and completing it repoints
 * `communities.stripe_customer_id`/`stripe_subscription_id`. Someone with a
 * stolen session could therefore rebind the community's billing identity to a
 * Stripe customer they control — which would hand them the reauth-gated
 * `/billing/portal` (it resolves whatever customer the row names) and orphan
 * the real customer's invoices. Hence the same gate change-plan uses.
 *
 * Plan A1 drain #156. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Response is B1-canonical `{ data: { checkoutUrl } }`.
 */
import type Stripe from 'stripe';
import { runRoute } from '@propertypro/api-contract';
import { canStartNewSubscription } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireRootManager } from '@/lib/api/role-guard';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { AppError, ValidationError } from '@/lib/api/errors';
import { resolveStripePrice, getStripeClient } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { getCommunityForCheckout } from '@/lib/billing/billing-group-service';
import { findActiveAccessPlanIdForCommunity } from '@/lib/services/account-lifecycle-service';
import { subscribePostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(subscribePostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    // R3-03: billing is root-exclusive (ADR-006 §2). NOT `settings:write` —
    // that resolves through the single `manager` matrix row and would admit
    // every property manager.
    requireRootManager(
      membership,
      'Only the root manager can purchase a plan for this community. If this community has no root manager, a property manager can claim it from the dashboard.',
    );

    const { planId, billingInterval } = body;

    const community = await getCommunityForCheckout(communityId);
    if (!community) {
      throw new ValidationError('Community not found', { communityId: 'Not found' });
    }

    // Never open a second checkout for a community that already has a live
    // subscription — that mints a duplicate against the same Stripe customer
    // and double-bills them. Tier/interval switches belong to
    // /api/v1/subscribe/change-plan.
    //
    // Uses the shared predicate, NOT `status === 'active'`: `trialing` (every
    // signup's first 30 days), `past_due` and `incomplete` are all live
    // subscriptions that an equality check would wave straight through.
    if (!canStartNewSubscription(community)) {
      throw new AppError(
        'This community already has a subscription. Use Change plan to switch tiers.',
        400,
        'ALREADY_SUBSCRIBED',
      );
    }

    // Re-subscribe (a Stripe customer already exists) rebinds billing identity
    // — gate it like change-plan. A first purchase has nothing to protect.
    if (community.stripeCustomerId) {
      await requireFreshReauth(userId);
    }

    if (!isPlanAvailableForCommunityType(community.communityType, planId)) {
      throw new ValidationError('This plan is not available for your community type', {
        planId: 'Invalid plan for community type',
      });
    }

    const activePlanId = await findActiveAccessPlanIdForCommunity(communityId);
    const priceId = await resolveStripePrice(planId, community.communityType, billingInterval);

    const stripe = getStripeClient();

    // Keep `communityId` on both return URLs — the billing page resolves its
    // tenant from the query string when the host isn't community-specific.
    const billingUrl = `${req.nextUrl.origin}/settings/billing?communityId=${communityId}`;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${billingUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: billingUrl,
      metadata: {
        communityId: String(communityId),
        planId,
        ...(activePlanId !== null ? { accessPlanId: String(activePlanId) } : {}),
      },
    };

    if (community.stripeCustomerId) {
      sessionParams.customer = community.stripeCustomerId;
    }

    // Collapse double-submits onto one Stripe session. Bucketed to 10 minutes
    // rather than a bare key so an abandoned session doesn't pin this community
    // to a stale checkout URL for Stripe's full 24h idempotency window.
    // The customer id is part of the key: without it, two calls in the same
    // bucket that straddle a customer being attached would send DIFFERENT
    // params under the SAME key, which Stripe rejects with an
    // idempotency_error (a 500 to the user, not a clean message).
    const idempotencyBucket = Math.floor(Date.now() / 600_000);
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `subscribe:${communityId}:${community.stripeCustomerId ?? 'new'}:${planId}:${billingInterval}:${idempotencyBucket}`,
    });

    await emitConversionEvent({
      communityId,
      eventType: 'self_service_upgrade_started',
      source: 'web_app',
      dedupeKey: `community:${communityId}:upgrade:${session.id}`,
      userId,
    });

    return { checkoutUrl: session.url };
  }),
);
