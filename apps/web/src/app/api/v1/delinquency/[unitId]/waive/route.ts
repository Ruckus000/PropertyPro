/**
 * Delinquency — waive late fees for a unit.
 *
 * POST /api/v1/delinquency/[unitId]/waive
 * Body: { communityId }
 *
 * Plan A1 drain #80. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. **First drain with `[unitId]`
 * path param** (vs `[id]`). Auth chain preserved verbatim (mirrors drain #67):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                       (ASYNC)
 *     → requireCommunityMembership               (ASYNC)
 *     → requireFinanceEnabled                    (ASYNC)
 *     → requireFinanceWritePermission            (sync)
 *     → requireFinanceAdminWrite                 (sync)
 *     → requireActiveSubscriptionForMutation     (ASYNC)
 *     → waiveLateFeesForUnit(communityId, unitId, actorUserId, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[unitId]` and body
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
import { waiveLateFeesForUnit } from '@/lib/services/finance-service';
import { delinquencyWaiveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(delinquencyWaiveContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireFinanceEnabled(membership);
    requireFinanceWritePermission(membership);
    requireFinanceAdminWrite(membership);
    await requireActiveSubscriptionForMutation(communityId);

    return waiveLateFeesForUnit(
      communityId,
      params.unitId,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
