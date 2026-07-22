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
 * No reauth gate here, unlike change-plan: that route charges a payment method
 * already on file, whereas this one only mints a Stripe Checkout URL — nothing
 * is charged until the user enters card details on Stripe's own page.
 *
 * Plan A1 drain #156. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Response is B1-canonical `{ data: { checkoutUrl } }`.
 */
import type Stripe from 'stripe';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
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
    requirePermission(membership, 'settings', 'write');

    const { planId, billingInterval } = body;

    const community = await getCommunityForCheckout(communityId);
    if (!community) {
      throw new ValidationError('Community not found', { communityId: 'Not found' });
    }

    // Never open a second checkout for a community that already pays — that
    // would create a duplicate Stripe subscription and double-bill them. Tier
    // and interval switches belong to /api/v1/subscribe/change-plan.
    if (community.stripeSubscriptionId && community.subscriptionStatus === 'active') {
      throw new AppError(
        'This community already has an active subscription. Use Change plan to switch tiers.',
        400,
        'ALREADY_SUBSCRIBED',
      );
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
    const idempotencyBucket = Math.floor(Date.now() / 600_000);
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `subscribe:${communityId}:${planId}:${billingInterval}:${idempotencyBucket}`,
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
