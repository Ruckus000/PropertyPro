/**
 * POST /api/v1/communities/dispute-root-claim (role-v3 Phase 2b).
 *
 * A property_manager of the community opens a dispute against the current root
 * claim. Authorization is the explicit property_manager membership check below
 * (no RBAC gate — see contract.ts). `openDispute` is a no-op when the community
 * has no current root_manager (the dispute is moot).
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { openDispute } from '@/lib/services/root-dispute-service';
import { disputeRootClaimContract } from './contract';

export const POST = withErrorHandler(
  runRoute(disputeRootClaimContract, async ({ communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    // Only a property_manager of the community may dispute a root claim.
    if (membership.role !== 'property_manager') {
      throw new ForbiddenError('Only a property manager of this community can dispute a root claim.');
    }

    const result = await openDispute(communityId, userId);
    return result;
  }),
);
