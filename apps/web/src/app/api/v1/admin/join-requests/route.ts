/**
 * Admin Join Requests — GET /api/v1/admin/join-requests
 *
 * Lists pending join requests for the caller's active community.
 * Requires residents.write permission.
 *
 * Plan A1 drain #172 — migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { listPendingJoinRequestsForCommunity } from '@/lib/join-requests/approve-request';
import { adminJoinRequestsListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(adminJoinRequestsListContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    return listPendingJoinRequestsForCommunity(communityId);
  }),
);
