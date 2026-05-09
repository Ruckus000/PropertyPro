import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import {
  getBillingGroupByOwner,
  listSiblingCommunityPlans,
} from '@/lib/billing/billing-group-service';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';

const querySchema = z.object({
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
});

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const params = await ctx.params;
    const billingGroupId = Number(params.id);

    const group = await getBillingGroupByOwner(userId);
    if (!group || group.id !== billingGroupId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      planId: searchParams.get('planId'),
      communityType: searchParams.get('communityType'),
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid query', { issues: parsed.error.issues });
    }

    const existing = await listSiblingCommunityPlans(billingGroupId);

    const existingBasePrices = existing.map((c) =>
      c.planKey && c.planKey in PLAN_MONTHLY_PRICES_USD
        ? PLAN_MONTHLY_PRICES_USD[c.planKey as keyof typeof PLAN_MONTHLY_PRICES_USD]
        : 0,
    );

    const newPrice = PLAN_MONTHLY_PRICES_USD[parsed.data.planId];
    const impact = calculatePricingImpact({
      basePricesUsd: [...existingBasePrices, newPrice],
      currentGroupSize: existing.length,
      changeType: 'add',
    });

    return NextResponse.json({ data: impact });
  },
);
