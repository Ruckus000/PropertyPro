/**
 * POST /api/v1/subscribe
 *
 * Smart subscribe route — creates a Stripe checkout session.
 * If the community has an active/in_grace access plan, marks it as converted
 * after successful checkout (via Stripe webhook metadata).
 *
 * Plan A1 drain #156. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Response is B1-canonical `{ data: { checkoutUrl } }`.
 */
import Stripe from 'stripe';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors';
import { resolveStripePrice } from '@/lib/services/stripe-service';
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

    const { planId } = body;

    const community = await getCommunityForCheckout(communityId);
    if (!community) {
      throw new ValidationError('Community not found', { communityId: 'Not found' });
    }

    if (!isPlanAvailableForCommunityType(community.communityType, planId)) {
      throw new ValidationError('This plan is not available for your community type', {
        planId: 'Invalid plan for community type',
      });
    }

    const activePlanId = await findActiveAccessPlanIdForCommunity(communityId);
    const priceId = await resolveStripePrice(planId, community.communityType, 'month');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/settings/billing`,
      metadata: {
        communityId: String(communityId),
        planId,
        ...(activePlanId !== null ? { accessPlanId: String(activePlanId) } : {}),
      },
    };

    if (community.stripeCustomerId) {
      sessionParams.customer = community.stripeCustomerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
