/**
 * POST /api/v1/stripe/connect/complete
 *
 * Plan A1 drain #167. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Exchanges the Stripe OAuth authorization code for a connected account ID.
 * Called from the /settings/payments/connected callback page after
 * the user completes Stripe Connect Standard onboarding.
 */
import { runRoute } from '@propertypro/api-contract';
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
import {
  completeConnectOnboarding,
  validateConnectOAuthState,
} from '@/lib/services/finance-service';
import { stripeConnectCompletePostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(stripeConnectCompletePostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const { communityId, code, state } = body;

    validateConnectOAuthState(state, communityId, userId);

    const membership = await requireCommunityMembership(communityId, userId);
    await requireFinanceEnabled(membership);
    // Legal gate — online payments ship disabled (audit F-15).
    requirePaymentsEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return completeConnectOnboarding(
      communityId,
      code,
      userId,
      req.headers.get('x-request-id'),
    );
  }),
);
