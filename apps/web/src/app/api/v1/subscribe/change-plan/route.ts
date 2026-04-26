/**
 * POST /api/v1/subscribe/change-plan
 *
 * In-app plan switch for an existing paid subscriber. Calls
 * stripe.subscriptions.update() with the new price + immediate proration
 * (always_invoice). The customer.subscription.updated webhook then writes
 * the new planId back to communities.subscriptionPlan.
 *
 * Upgrades only — downgrades and cancellation stay on the Stripe portal.
 * Reauth-protected (requires fresh pp-reauth cookie).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_IDS, comparePlanTiers, type PlanId } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { AppError, ValidationError } from '@/lib/api/errors';
import { resolveStripePrice, changeSubscriptionPlan } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';

const changePlanSchema = z.object({
  planId: z.enum(PLAN_IDS),
  billingInterval: z.enum(['month', 'year']),
});

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');
  await requireFreshReauth(userId);

  const body = await req.json();
  const parsed = changePlanSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const { planId, billingInterval } = parsed.data;

  const db = createUnscopedClient();
  const [community] = await db
    .select({
      id: communities.id,
      communityType: communities.communityType,
      stripeSubscriptionId: communities.stripeSubscriptionId,
      subscriptionPlan: communities.subscriptionPlan,
      subscriptionStatus: communities.subscriptionStatus,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) {
    throw new ValidationError('Community not found', { communityId: 'Not found' });
  }

  if (!community.stripeSubscriptionId || community.subscriptionStatus !== 'active') {
    throw new AppError(
      'No active subscription to change. Start a subscription first.',
      400,
      'NO_ACTIVE_SUBSCRIPTION',
    );
  }

  if (!isPlanAvailableForCommunityType(community.communityType, planId)) {
    throw new ValidationError('This plan is not available for your community type', {
      planId: 'Invalid plan for community type',
    });
  }

  // Block downgrades and cross-ladder switches; allow tier upgrades and
  // same-plan interval changes (e.g. monthly → annual on Essentials).
  const currentPlan = community.subscriptionPlan as PlanId | null;
  if (currentPlan) {
    const cmp = comparePlanTiers(currentPlan, planId);
    if (cmp === null || cmp > 0) {
      throw new AppError(
        'Only upgrades are supported in-app. Use the Stripe billing portal to downgrade or cancel.',
        400,
        'DOWNGRADE_NOT_SUPPORTED',
      );
    }
  }

  const priceId = await resolveStripePrice(planId, community.communityType, billingInterval);

  try {
    await changeSubscriptionPlan(community.stripeSubscriptionId, priceId);
  } catch (err) {
    console.error('[change-plan] Stripe update failed:', err);
    if (err instanceof AppError) throw err;
    throw new AppError(
      'Could not update your subscription. Please try again or contact support.',
      502,
      'STRIPE_UPDATE_FAILED',
    );
  }

  await emitConversionEvent({
    communityId,
    eventType: 'self_service_plan_changed',
    source: 'web_app',
    dedupeKey: `community:${communityId}:plan-change:${Date.now()}`,
    userId,
    metadata: {
      fromPlan: currentPlan ?? 'unknown',
      toPlan: planId,
      billingInterval,
    },
  });

  return NextResponse.json({ ok: true, planId, billingInterval });
});
