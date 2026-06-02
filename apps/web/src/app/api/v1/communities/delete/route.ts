/**
 * POST /api/v1/communities/delete
 * DELETE /api/v1/communities/delete (cancel)
 *
 * Community admin requests or cancels community deletion.
 * Community ID from x-community-id header (set by middleware).
 *
 * Plan A1 drain #158. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { AppError } from '@/lib/api/errors/AppError';
import {
  findCoolingCommunityDeletionRequest,
  interveneCommunityDeletion,
  requestCommunityDeletion,
} from '@/lib/services/account-lifecycle-service';
import {
  communityDeleteDeleteContract,
  communityDeletePostContract,
} from './contract';

export const POST = withErrorHandler(
  runRoute(communityDeletePostContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'settings', 'write');

    return requestCommunityDeletion(communityId, userId);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(communityDeleteDeleteContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'settings', 'write');

    const activeRequestId = await findCoolingCommunityDeletionRequest(communityId);
    if (activeRequestId === null) {
      throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
    }

    await interveneCommunityDeletion(activeRequestId, {
      adminUserId: userId,
      notes: 'Cancelled by community administrator',
    });

    return { cancelled: true as const };
  }),
);
