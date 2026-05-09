/**
 * POST /api/v1/subscribe
 *
 * Smart subscribe route — creates a Stripe checkout session.
 * If the community has an active/in_grace access plan, marks it as converted
 * after successful checkout (via Stripe webhook metadata).
 *
 * This is the user-facing subscribe flow. The admin "demo convert" flow
 * at /api/v1/admin/demo/[slug]/convert is a separate admin-initiated flow.
 */
import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { PLAN_IDS } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { resolveStripePrice } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { getCommunityForCheckout } from '@/lib/billing/billing-group-service';
import { findActiveAccessPlanIdForCommunity } from '@/lib/services/account-lifecycle-service';

const subscribeSchema = z.object({
  planId: z.enum(PLAN_IDS),
});

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');

  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  const { planId } = parsed.data;

  // Look up community for Stripe customer info + community type
  const community = await getCommunityForCheckout(communityId);
  if (!community) {
    throw new ValidationError('Community not found', { communityId: 'Not found' });
  }

  // Validate plan is available for this community type
  if (!isPlanAvailableForCommunityType(community.communityType, planId)) {
    throw new ValidationError('This plan is not available for your community type', {
      planId: 'Invalid plan for community type',
    });
  }

  // Check for active access plan to include in checkout metadata
  const activePlanId = await findActiveAccessPlanIdForCommunity(communityId);

  // Resolve Stripe price from DB
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
      // If there's an active access plan, include its ID so the webhook can mark it converted
      ...(activePlanId !== null ? { accessPlanId: String(activePlanId) } : {}),
    },
  };

  // Attach existing Stripe customer if we have one
  if (community.stripeCustomerId) {
    sessionParams.customer = community.stripeCustomerId;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  // Emit self_service_upgrade_started for non-demo communities upgrading
  await emitConversionEvent({
    communityId,
    eventType: 'self_service_upgrade_started',
    source: 'web_app',
    dedupeKey: `community:${communityId}:upgrade:${session.id}`,
    userId,
  });

  return NextResponse.json({ checkoutUrl: session.url });
});
