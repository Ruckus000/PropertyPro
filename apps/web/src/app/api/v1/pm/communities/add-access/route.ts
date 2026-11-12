/**
 * GET /api/v1/pm/communities/add-access — may the caller add a community?
 *
 * Answers 200 for every signed-in user (`allowed: false` for anyone who is not
 * the portfolio's billing owner and root), so the account menu can ask without
 * a 403 for residents. Always `false` under a support session: adding a
 * community is a portfolio-wide billing action, outside a one-community grant.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { getAddCommunityAccess } from '@/lib/api/pm-communities';
import { getSupportScope } from '@/lib/support/support-scope';
import { pmCommunitiesAddAccessContract } from './contract';

// route-gate: self-scoped — answers only about the caller, from their own billing groups and role rows
export const GET = withErrorHandler(
  runRoute(pmCommunitiesAddAccessContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    if (getSupportScope(req.headers)) return { allowed: false, billingGroupId: null };

    const access = await getAddCommunityAccess(userId);
    return access.allowed
      ? { allowed: true, billingGroupId: access.billingGroupId }
      : { allowed: false, billingGroupId: null };
  }),
);
