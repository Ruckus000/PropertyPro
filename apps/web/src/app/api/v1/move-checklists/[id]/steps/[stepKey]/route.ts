import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { updateChecklistStep } from '@/lib/services/move-checklist-service';
import { updateMoveChecklistStepContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(updateMoveChecklistStepContract, async ({ params, body, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;
    const { stepKey } = params;
    // `communityId` comes from the runner (tenantScope, header-reconciled);
    // strip the body copy so only the step fields reach the service.
    const { communityId: _bodyCommunityId, ...stepInput } = body;

    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    return updateChecklistStep(
      communityId,
      checklistId,
      stepKey,
      stepInput,
      userId,
    );
  }),
);
