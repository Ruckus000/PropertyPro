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
import { PLAN_IDS, comparePlanTiers, type PlanId } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  resolveStripePrice,
  changeSubscriptionPlan,
  getActiveSubscriptionInterval,
} from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { getCommunityForChangePlan } from '@/lib/billing/billing-group-service';

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

  const community = await getCommunityForChangePlan(communityId);
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
    // Same plan: only valid if the billing interval is actually changing —
    // otherwise we'd issue a Stripe update with an identical price and
    // trigger an empty proration invoice for the customer.
    if (cmp === 0) {
      const currentInterval = await getActiveSubscriptionInterval(
        community.stripeSubscriptionId,
      ).catch(() => null);
      if (currentInterval === billingInterval) {
        throw new AppError(
          'You are already on this plan and billing interval.',
          400,
          'NO_OP_PLAN_CHANGE',
        );
      }
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
    // Stable dedupe within a 1-minute window: if the same user double-submits
    // identical plan+interval, we only record one funnel event. Bucketing by
    // minute keeps a legitimate change-then-revert from being swallowed.
    dedupeKey: `community:${communityId}:plan-change:${planId}:${billingInterval}:${Math.floor(Date.now() / 60_000)}`,
    userId,
    metadata: {
      fromPlan: currentPlan ?? 'unknown',
      toPlan: planId,
      billingInterval,
    },
  });

  return NextResponse.json({ ok: true, planId, billingInterval });
});
