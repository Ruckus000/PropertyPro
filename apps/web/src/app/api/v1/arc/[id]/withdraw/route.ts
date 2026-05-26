/**
 * ARC — withdraw a submission (resident-facing).
 *
 * POST /api/v1/arc/[id]/withdraw
 * Body: { communityId }
 *
 * Plan A1 drain #61. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim — this is a RESIDENT-submitter endpoint (`requireArcSubmitterRole`
 * gate) and intentionally has NO ARC-admin gate:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC, awaited)
 *     → requirePermission('arc_submissions', 'write')
 *     → requireArcSubmitterRole (sync)
 *     → createScopedClient(communityId) (sync)
 *     → getActorUnitIds(scoped, actorUserId) (async, awaited)
 *     → withdrawArcSubmissionForCommunity(communityId, id, actorUserId,
 *         unitIds, x-request-id)
 *
 * SCOPED DB CALL: the in-handler `createScopedClient(communityId)` +
 * `getActorUnitIds(scoped, actorUserId)` step is preserved verbatim. The
 * resolved `unitIds: number[]` flows into the service as the 4th positional
 * argument.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `withdrawArcSubmissionForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getActorUnitIds,
  requireArcEnabled,
  requireArcSubmitterRole,
} from '@/lib/violations/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { withdrawArcSubmissionForCommunity } from '@/lib/services/violations-service';
import { requirePermission } from '@/lib/db/access-control';
import { arcWithdrawContract } from './contract';

export const POST = withErrorHandler(
  runRoute(arcWithdrawContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireArcEnabled(membership);
    requirePermission(membership, 'arc_submissions', 'write');
    requireArcSubmitterRole(membership);

    const scoped = createScopedClient(communityId);
    const unitIds = await getActorUnitIds(scoped, actorUserId);

    return withdrawArcSubmissionForCommunity(
      communityId,
      params.id,
      actorUserId,
      unitIds,
      req.headers.get('x-request-id'),
    );
  }),
);
