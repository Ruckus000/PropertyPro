/**
 * PATCH/DELETE handlers for `/api/v1/assessments/[id]`.
 *
 * Plan A1 drain #92 — migrated from `withErrorHandler(async (req, ctx))`
 * to `withErrorHandler(runRoute(contract, ...))`. See `./contract.ts` for
 * the full auth-chain + response-modeling rationale.
 *
 * Notes:
 *  - `requireFinanceEnabled` and `requireActiveSubscriptionForMutation`
 *    are async; the sync siblings (`requireFinanceWritePermission`,
 *    `requireFinanceAdminWrite`) are not. Order preserved verbatim.
 *  - PATCH preserves the pre-migration "at least one field" guard with
 *    its original message string.
 *  - PATCH service call shape: `updateAssessmentForCommunity(communityId,
 *    params.id, actorUserId, updates, requestId)` where `updates` is the
 *    parsed body MINUS `communityId` (object-spread destructure).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { BadRequestError } from '@/lib/api/errors';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  deleteAssessmentForCommunity,
  updateAssessmentForCommunity,
} from '@/lib/services/finance-service';
import {
  assessmentDeleteContract,
  assessmentUpdateContract,
} from './contract';

export const PATCH = withErrorHandler(
  runRoute(assessmentUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const { communityId: rawCommunityId, ...updates } = body;
    if (Object.keys(updates).length === 0) {
      throw new BadRequestError('At least one field must be provided for update');
    }
    const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return updateAssessmentForCommunity(
      communityId,
      params.id,
      actorUserId,
      updates,
      req.headers.get('x-request-id'),
    );
  }),
);

export const DELETE = withErrorHandler(
  runRoute(assessmentDeleteContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    await deleteAssessmentForCommunity(
      communityId,
      params.id,
      actorUserId,
      req.headers.get('x-request-id'),
    );

    return { success: true as const };
  }),
);
