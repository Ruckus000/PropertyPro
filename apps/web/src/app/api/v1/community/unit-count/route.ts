/**
 * `/api/v1/community/unit-count` — see ./contract.ts for why this exists.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { updateCommunityUnitCount } from '@/lib/services/community-profile-service';
import { patchCommunityUnitCountContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(patchCommunityUnitCountContract, async ({ body, communityId }) => {
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can change the number of units');
    }

    // The service writes the audit row (old → new), and only on a change.
    const { unitCount } = await updateCommunityUnitCount(communityId, body.unitCount, {
      actorUserId: userId,
    });
    return { unitCount };
  }),
);
