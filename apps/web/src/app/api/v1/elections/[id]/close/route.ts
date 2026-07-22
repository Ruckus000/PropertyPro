/**
 * Elections — close election (admin state transition)
 *
 * POST /api/v1/elections/[id]/close
 *
 * Plan A1 drain #43. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace(communityId)
 *   → requireCommunityMembership
 *   → requireElectionsEnabled (sync, NOT awaited)
 *   → requirePermission('elections', 'write')
 *   → requireElectionsAdminRole(membership)
 *   → closeElectionForCommunity(communityId, electionId, actorUserId, req.headers.get('x-request-id'))
 *
 * Mechanically identical to sibling drain #42 (elections/[id]/open) —
 * only the service function differs.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` /
 * missing or non-numeric body `communityId` shifts to the canonical
 * `VALIDATION_ERROR` envelope. Status unchanged at 400. Success wire
 * shape `{ data: result }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsAdminRole, requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { closeElectionForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsCloseContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsCloseContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    await requireActiveSubscriptionForMutation(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');
    requireElectionsAdminRole(membership);

    return closeElectionForCommunity(
      communityId,
      params.id,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
