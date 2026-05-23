/**
 * GET /api/v1/communities/[id]/cancel-preview — preview pricing impact of
 * cancelling a community subscription.
 *
 * Plan A1 drain #18. Mirrors drain #11 (`polls/[id]/my-vote`) path-param-only
 * shape via the contract runner. The runner awaits Next.js's
 * `Promise<params>` for us — `params` arrives synchronously in the handler.
 *
 * Auth chain (preserved verbatim from pre-migration):
 *   1. `requireAuthenticatedUserId()` — Supabase session, 401 on miss.
 *   2. `getCommunityForCancelPreview(communityId)` → 404 if not found
 *      (community missing or soft-deleted).
 *   3. If `target.billingGroupId === null` → early return manual no-op
 *      shape `{ previousTier: 'none', newTier: 'none',
 *      perCommunityBreakdown: [], portfolioMonthlyDeltaUsd: 0 }`.
 *      `getBillingGroupOwner` is NOT called on this branch.
 *   4. `getBillingGroupOwner(billingGroupId)` → 403 unless ownerUserId
 *      matches the authenticated actor.
 *   5. `listSiblingCommunityPlans(billingGroupId, communityId)` →
 *      `calculatePricingImpact({ basePricesUsd, currentGroupSize, changeType:
 *      'remove' })` → return impact.
 *
 * Response shape: TWO branches — see contract.ts response-modeling rationale.
 * Both branches are returned RAW (the runner wraps them in `{ data: ... }`).
 * The pre-migration handler also emitted `{ data: ... }`, so the wire shape
 * is unchanged. Consumer (`useCancelPreview`) reads `json.data as
 * CancelPreview` and continues to see the same payload.
 *
 * Behavior change vs. pre-migration: invalid path param (non-numeric or
 * non-positive `[id]`) now returns the runner's canonical `VALIDATION_ERROR`
 * envelope at 400 instead of `Number('abc') = NaN` being silently passed
 * to `getCommunityForCancelPreview` (which would have done a `where id =
 * NaN` query and almost certainly returned null → 404). Status code path
 * for malformed input shifts from 404 → 400; the wire envelope is the
 * runner's canonical shape. The consumer hook surfaces failures opaquely
 * (read flag + retry) and does not branch on the response body, so the
 * delta is safe.
 */
import { runRoute } from '@propertypro/api-contract';
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
import { cancelPreviewContract } from './contract';

export const GET = withErrorHandler(
  runRoute(cancelPreviewContract, async ({ params }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = params.id;

    const target = await getCommunityForCancelPreview(communityId);
    if (!target) throw new NotFoundError('Community not found');
    if (!target.billingGroupId) {
      return {
        previousTier: 'none',
        newTier: 'none',
        perCommunityBreakdown: [],
        portfolioMonthlyDeltaUsd: 0,
      };
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
    return calculatePricingImpact({
      basePricesUsd: remainingBasePrices,
      currentGroupSize: currentCount,
      changeType: 'remove',
    });
  }),
);
