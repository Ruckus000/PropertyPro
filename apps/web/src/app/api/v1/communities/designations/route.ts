/**
 * POST /api/v1/communities/designations (role-v3 Phase 2c, root-initiated).
 *
 * The community's root_manager sets or clears a board designation
 * (board_president | board_member | null) for a community member.
 * Authorization is the explicit root-identity check below (no RBAC gate —
 * see contract.ts).
 *
 * NonOwnerAckRequiredError from the service is mapped to a 409 to allow the
 * client to prompt for acknowledgement before retrying with
 * acknowledgeNonOwner: true.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  setDesignation,
  NonOwnerAckRequiredError,
} from '@/lib/services/role-management-service';
import { setDesignationContract } from './contract';

export const POST = withErrorHandler(
  runRoute(setDesignationContract, async ({ body, communityId }) => {
    const callerId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, callerId);

    if (membership.role !== 'root_manager') {
      throw new ForbiddenError('Only the root manager can manage roles.');
    }

    try {
      return await setDesignation(
        communityId,
        membership.communityType,
        body.userId,
        body.designation,
        body.acknowledgeNonOwner ?? false,
        callerId,
      );
    } catch (err) {
      if (err instanceof NonOwnerAckRequiredError) {
        throw new AppError(
          'Board eligibility acknowledgement required for a non-owner.',
          409,
          'NON_OWNER_ACK_REQUIRED',
        );
      }
      throw err;
    }
  }),
);
