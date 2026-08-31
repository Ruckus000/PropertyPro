/**
 * POST /api/v1/stripe/connect/onboard
 *
 * Plan A1 drain #164. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requirePaymentsEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { startConnectOnboarding } from '@/lib/services/finance-service';
import { stripeConnectOnboardPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(stripeConnectOnboardPostContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Legal gate — online payments ship disabled (audit F-15).
    requirePaymentsEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return startConnectOnboarding(
      communityId,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
