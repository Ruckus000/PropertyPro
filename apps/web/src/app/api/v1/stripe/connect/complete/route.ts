/**
 * POST /api/v1/stripe/connect/complete
 *
 * Plan A1 drain #167. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Re-reads the community's saved Stripe connected account after Stripe's
 * hosted onboarding sends the admin back to /settings/payments/connected.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requirePaymentsEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { completeConnectOnboarding } from '@/lib/services/finance-service';
import { stripeConnectCompletePostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(stripeConnectCompletePostContract, async ({ req, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    await requireFinanceEnabled(membership);
    // Legal gate — online payments ship disabled (audit F-15).
    requirePaymentsEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return completeConnectOnboarding(
      communityId,
      userId,
      req.headers.get('x-request-id'),
    );
  }),
);
