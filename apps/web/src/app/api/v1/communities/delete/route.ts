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
import { requireRootManager } from '@/lib/api/role-guard';
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
    // R3-03: community deletion is root-exclusive (ADR-006 §2).
    requireRootManager(
      membership,
      'Only the root manager can request deletion of this community. If this community has no root manager, a property manager can claim it from the dashboard.',
    );

    return requestCommunityDeletion(communityId, userId);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(communityDeleteDeleteContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);
    // R3-03: root-exclusive, same as the POST.
    //
    // Considered and rejected: leaving CANCEL open to the management tier on
    // the "undo should never be harder than do" principle. It would let a
    // property manager overturn the root's deliberate decision, which is the
    // authority inversion this whole item exists to close. The safety valve is
    // instead platform-admin intervention (`interveneCommunityDeletion`, admin
    // app) during the cooling-off window — a break-glass that leaves an audit
    // trail, rather than a standing permission.
    requireRootManager(
      membership,
      'Only the root manager can cancel the deletion request for this community. If this community has no root manager, a property manager can claim it from the dashboard.',
    );

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
