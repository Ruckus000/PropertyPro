import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requirePaymentsEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireActorOwnsPi, updatePaymentIntentFee } from '@/lib/services/finance-service';
import { updatePaymentIntentContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(updatePaymentIntentContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    // Legal gate — online payments ship disabled (audit F-15).
    requirePaymentsEnabled(membership);
    requireFinanceWritePermission(membership);

    if (membership.role === 'resident' && membership.isUnitOwner) {
      // communityId is required now: under direct charges the PaymentIntent
      // lives on the association's connected account, so the ownership check
      // has to retrieve it from there (F-15).
      await requireActorOwnsPi(body.paymentIntentId, actorUserId, communityId);
    } else {
      requireFinanceAdminWrite(membership);
    }

    return updatePaymentIntentFee(
      communityId,
      body.paymentIntentId,
      body.paymentMethod,
      actorUserId,
    );
  }),
);
