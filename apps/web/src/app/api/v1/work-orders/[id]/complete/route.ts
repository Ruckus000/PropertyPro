/**
 * Work orders — mark a work order complete (admin-facing).
 *
 * POST /api/v1/work-orders/[id]/complete
 * Body: { communityId }
 *
 * Plan A1 drain #63. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. FIRST drain that exercises
 * the `requirePlanFeature` async plan-gate (per-plan feature flag check
 * against the `communities.subscriptionPlan` column).
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireWorkOrdersEnabled (sync, NOT awaited)
 *     → requirePlanFeature(communityId, 'hasWorkOrders') (async — awaited)
 *     → requireWorkOrdersWritePermission (sync)
 *     → requireWorkOrderAdminWrite (sync)
 *     → completeWorkOrderForCommunity(communityId, workOrderId, actorUserId, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `completeWorkOrderForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { completeWorkOrderForCommunity } from '@/lib/services/work-orders-service';
import { workOrdersCompleteContract } from './contract';

export const POST = withErrorHandler(
  runRoute(workOrdersCompleteContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersWritePermission(membership);
    requireWorkOrderAdminWrite(membership);

    return completeWorkOrderForCommunity(
      communityId,
      params.id,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
