/**
 * GET /api/v1/billing-groups/mine
 *
 * Returns the billing group owned by the authenticated PM, creating one
 * on-demand from the PM's active portfolio when none exists yet. Only
 * callable by users who are pm_admin in at least one community.
 *
 * Plan A1 drain #6 (post-pilot): input validation is a no-op (no params /
 * query / body) and output validation + canonical envelope wrapping are
 * delegated to `runRoute()` from `@propertypro/api-contract`. The wire
 * response is the canonical single-payload envelope and is unchanged from
 * the pre-drain handler:
 *
 *     { data: { billingGroupId: number } }
 *
 * The consumer hook `useBillingGroup` pins this exact shape in its
 * docblock; no consumer changes are required by this drain.
 *
 * Authorization: session-anchored — the user is the anchor. The PM gate
 * (`isPmAdminInAnyCommunity`) and the on-demand billing-group creation
 * side effect inside `getOrCreateBillingGroupForPm` are preserved
 * verbatim.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { getOrCreateBillingGroupForPm } from '@/lib/billing/billing-group-service';
import { billingGroupsMineContract } from './contract';

export const GET = withErrorHandler(
  runRoute(billingGroupsMineContract, async () => {
    const userId = await requirePmPortfolioAccess();

    const { billingGroupId } = await getOrCreateBillingGroupForPm(userId);
    return { billingGroupId };
  }),
);
