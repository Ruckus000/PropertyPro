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
import { eq, and, isNull } from '@propertypro/db/filters';
import { accessPlans, communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_IDS } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { resolveStripePrice } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';

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
  const db = createUnscopedClient();

  // Look up community for Stripe customer info + community type
  const [community] = await db
    .select({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
      stripeCustomerId: communities.stripeCustomerId,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

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
  const [activePlan] = await db
    .select({ id: accessPlans.id })
    .from(accessPlans)
    .where(
      and(
        eq(accessPlans.communityId, communityId),
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
      ),
    )
    .limit(1);

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
      ...(activePlan ? { accessPlanId: String(activePlan.id) } : {}),
    },
  };

  // Attach existing Stripe customer if we have one
  if (community?.stripeCustomerId) {
    sessionParams.customer = community.stripeCustomerId;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ checkoutUrl: session.url });
});
