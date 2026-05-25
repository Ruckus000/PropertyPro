/**
 * GET /api/v1/billing-groups/[id]/preview — preview pricing impact of
 * ADDING a community to an existing billing group.
 *
 * Plan A1 drain #21. Mirrors drain #18 (`communities/[id]/cancel-preview`)
 * billing-group-ownership auth model via the contract runner. The runner
 * awaits Next.js's `Promise<params>` for us — `params` and `query` arrive
 * synchronously in the handler.
 *
 * Auth chain (preserved verbatim from pre-migration):
 *   1. `requireAuthenticatedUserId()` — Supabase session, 401 on miss.
 *   2. `getBillingGroupByOwner(userId)` — lookup the actor's billing group.
 *   3. 403 if no group OR `group.id !== billingGroupId` (cross-actor
 *      access attempt). Drain #18 used `getBillingGroupOwner(billingGroupId)`
 *      (lookup by group id, then compare owner) — different lookup
 *      direction, same ownership semantics.
 *   4. `listSiblingCommunityPlans(billingGroupId)` (single-arg form — no
 *      excludeCommunityId, since this is the ADD path; all current
 *      communities in the group are siblings).
 *   5. `calculatePricingImpact({ basePricesUsd: [...existing, newPlanPrice],
 *      currentGroupSize: existing.length, changeType: 'add' })` → return.
 *
 * Response shape: returned RAW (the runner wraps it in `{ data: ... }`).
 * The pre-migration handler also emitted `{ data: impact }`, so the wire
 * shape is unchanged. Consumer (`useBillingGroupPreview`) reads
 * `json.data as PricingPreview` and continues to see the same payload.
 *
 * Behavior change vs. pre-migration: invalid path param (non-numeric or
 * non-positive `[id]`) now returns the runner's canonical `VALIDATION_ERROR`
 * envelope at 400 instead of `Number('abc') = NaN` silently flowing into
 * the ownership comparison (where `group.id !== NaN` would always trip
 * the 403 branch). Status code path for malformed input shifts from 403 →
 * 400; the wire envelope is the runner's canonical shape. Invalid query
 * (missing or out-of-enum `planId`/`communityType`) was a 400
 * `ValidationError` pre-migration with a Zod-issues payload; now a 400
 * `VALIDATION_ERROR` envelope. The consumer hook surfaces failures
 * opaquely (read flag + retry) and does not branch on the response body,
 * so the delta is safe.
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
import { billingGroupPreviewContract } from './contract';

export const GET = withErrorHandler(
  runRoute(billingGroupPreviewContract, async ({ params, query }) => {
    const userId = await requireAuthenticatedUserId();
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
