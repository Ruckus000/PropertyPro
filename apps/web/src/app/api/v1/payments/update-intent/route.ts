import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
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
    requireFinanceWritePermission(membership);

    if (membership.role === 'resident' && membership.isUnitOwner) {
      await requireActorOwnsPi(body.paymentIntentId, actorUserId);
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
