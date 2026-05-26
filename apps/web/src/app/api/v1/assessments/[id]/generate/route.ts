/**
 * Assessments — generate line items for the resolved community.
 *
 * POST /api/v1/assessments/[id]/generate
 * Body: { communityId, dueDate? }
 *
 * Plan A1 drain #67. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. **First drain exercising
 * `requireActiveSubscriptionForMutation`** (async subscription gate). Auth
 * chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                       (ASYNC)
 *     → requireCommunityMembership               (ASYNC)
 *     → requireFinanceEnabled                    (ASYNC)
 *     → requireFinanceWritePermission            (sync)
 *     → requireFinanceAdminWrite                 (sync)
 *     → requireActiveSubscriptionForMutation     (ASYNC)
 *     → generateAssessmentLineItemsForCommunity(communityId, assessmentId, actorUserId, dueDate ?? null, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to the service call.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { generateAssessmentLineItemsForCommunity } from '@/lib/services/finance-service';
import { assessmentsGenerateContract } from './contract';

export const POST = withErrorHandler(
  runRoute(assessmentsGenerateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireFinanceEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return generateAssessmentLineItemsForCommunity(
      communityId,
      params.id,
      actorUserId,
      body.dueDate ?? null,
      req.headers.get('x-request-id'),
    );
  }),
);
