/**
 * POST /api/v1/communities/transfer-root (role-v3 Phase 2b, root-initiated).
 *
 * The community's current root_manager transfers root to another
 * property_manager. Authorization is the explicit root-identity check below
 * (no RBAC gate — see contract.ts). The atomic demote-then-promote and the
 * "target must be a property_manager" check live in `transferRoot`.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { transferRoot } from '@/lib/services/root-dispute-service';
import { transferRootContract } from './contract';

export const POST = withErrorHandler(
  runRoute(transferRootContract, async ({ body, communityId }) => {
    const callerId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, callerId);

    // Only the community's current root_manager may transfer root.
    if (membership.role !== 'root_manager') {
      throw new ForbiddenError('Only the current root manager can transfer root.');
    }

    await transferRoot(communityId, callerId, body.toUserId);
    return { transferred: true };
  }),
);
