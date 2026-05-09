import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';
import {
  getBillingGroupOwner,
  getCommunityForCancelPreview,
  listSiblingCommunityPlans,
} from '@/lib/billing/billing-group-service';

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const params = await ctx.params;
    const communityId = Number(params.id);

    const target = await getCommunityForCancelPreview(communityId);
    if (!target) throw new NotFoundError('Community not found');
    if (!target.billingGroupId) {
      return NextResponse.json({
        data: {
          previousTier: 'none',
          newTier: 'none',
          perCommunityBreakdown: [],
          portfolioMonthlyDeltaUsd: 0,
        },
      });
    }

    const ownerUserId = await getBillingGroupOwner(target.billingGroupId);
    if (ownerUserId === null || ownerUserId !== userId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    const remaining = await listSiblingCommunityPlans(target.billingGroupId, communityId);

    const remainingBasePrices = remaining.map((c) =>
      c.planKey && c.planKey in PLAN_MONTHLY_PRICES_USD
        ? PLAN_MONTHLY_PRICES_USD[c.planKey as keyof typeof PLAN_MONTHLY_PRICES_USD]
        : 0,
    );

    const currentCount = remaining.length + 1;
    const impact = calculatePricingImpact({
      basePricesUsd: remainingBasePrices,
      currentGroupSize: currentCount,
      changeType: 'remove',
    });

    return NextResponse.json({ data: impact });
  },
);
