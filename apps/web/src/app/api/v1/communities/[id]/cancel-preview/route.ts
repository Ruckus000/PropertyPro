import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, billingGroups } from '@propertypro/db';
import { eq, and, isNull, ne } from '@propertypro/db/filters';

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const params = await ctx.params;
    const communityId = Number(params.id);

    const db = createUnscopedClient();

    const [target] = await db
      .select({
        id: communities.id,
        billingGroupId: communities.billingGroupId,
        subscriptionPlan: communities.subscriptionPlan,
      })
      .from(communities)
      .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
      .limit(1);

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

    const [group] = await db
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, target.billingGroupId))
      .limit(1);

    if (!group || group.ownerUserId !== userId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    const remaining = await db
      .select({ planKey: communities.subscriptionPlan })
      .from(communities)
      .where(
        and(
          eq(communities.billingGroupId, target.billingGroupId),
          isNull(communities.deletedAt),
          ne(communities.id, communityId),
        ),
      );

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
