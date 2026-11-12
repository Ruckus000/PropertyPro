/**
 * GET /api/v1/billing-groups/[id]/preview — the pricing impact of ADDING a
 * community of plan `planId` to billing group `[id]`. Read by the add-community
 * form (`useBillingGroupPreview`).
 *
 * 1. `requireAuthenticatedUserId()` — 401 without a session.
 * 2. Refused under a support session: a billing group spans the owner's
 *    portfolio, which a one-community support grant does not cover.
 * 3. 403 unless `[id]` is the caller's own group (`getBillingGroupByOwner`).
 * 4. Prices every community already in the group plus the new plan
 *    (`calculatePricingImpact`, `changeType: 'add'`).
 *
 * A non-numeric or non-positive `[id]`, or a missing / unknown `planId` or
 * `communityType`, is the runner's 400 `VALIDATION_ERROR`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import {
  getBillingGroupByOwner,
  listSiblingCommunityPlans,
} from '@/lib/billing/billing-group-service';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';
import { refuseUnderSupportSession } from '@/lib/support/support-scope';
import { billingGroupPreviewContract } from './contract';

// route-gate: self-scoped — getBillingGroupByOwner(userId) returns only the caller's own group; any other id is refused (and the whole route under a support session)
export const GET = withErrorHandler(
  runRoute(billingGroupPreviewContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    // A billing group spans the owner's portfolio, which a support session
    // (consented for ONE community) does not cover.
    refuseUnderSupportSession(req.headers);
    const billingGroupId = params.id;

    const group = await getBillingGroupByOwner(userId);
    if (!group || group.id !== billingGroupId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    const existing = await listSiblingCommunityPlans(billingGroupId);

    const existingBasePrices = existing.map((c) =>
      c.planKey && c.planKey in PLAN_MONTHLY_PRICES_USD
        ? PLAN_MONTHLY_PRICES_USD[c.planKey as keyof typeof PLAN_MONTHLY_PRICES_USD]
        : 0,
    );

    const newPrice = PLAN_MONTHLY_PRICES_USD[query.planId];
    return calculatePricingImpact({
      basePricesUsd: [...existingBasePrices, newPrice],
      currentGroupSize: existing.length,
      changeType: 'add',
    });
  }),
);
