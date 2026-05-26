/**
 * ARC — fetch a single submission (resident-or-admin read).
 *
 * GET /api/v1/arc/[id]?communityId=...
 *
 * Plan A1 drain #68. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC — awaited)
 *     → requirePermission('arc_submissions', 'read')
 *     → if (isResidentRole(membership.role)) await getActorUnitIds(scoped, actorUserId)
 *     → getArcSubmissionForCommunity(communityId, params.id, residentUnitIds)
 *
 * The conditional resident-unit-filter is preserved verbatim — residents
 * pass their owned unit ids; admins/staff pass `undefined` (no filter).
 *
 * This handler does NOT call `assertNotDemoGrace` — matches pre-migration
 * behavior (GET reads pass through demo grace).
 *
 * Behavior change vs. pre-migration: 400 envelope for invalid `[id]` and
 * missing/invalid `communityId` query shifts to the canonical
 * `VALIDATION_ERROR` envelope. Status unchanged. Success wire shape
 * `{ data: T }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getActorUnitIds, isResidentRole, requireArcEnabled } from '@/lib/violations/common';
import { getArcSubmissionForCommunity } from '@/lib/services/violations-service';
import { requirePermission } from '@/lib/db/access-control';
import { arcDetailContract } from './contract';

export const GET = withErrorHandler(
  runRoute(arcDetailContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requirePermission(membership, 'arc_submissions', 'read');

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    return await getArcSubmissionForCommunity(communityId, params.id, residentUnitIds);
  }),
);
