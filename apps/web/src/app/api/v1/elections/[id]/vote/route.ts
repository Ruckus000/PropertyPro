/**
 * Elections — cast a vote (resident-facing).
 *
 * POST /api/v1/elections/[id]/vote
 * Body: { communityId, selectedCandidateIds?, isAbstention?, proxyId?, unitId? }
 *
 * Plan A1 drain #50. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim — note this is a RESIDENT-facing endpoint and intentionally has
 * NO `requireElectionsAdminRole` gate:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync, NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → castElectionVoteForCommunity(communityId, electionId, actorUserId,
 *         { selectedCandidateIds, isAbstention, proxyId, unitId },
 *         x-request-id)
 *
 * The `?? null` coercion on `proxyId` and `unitId` is preserved verbatim —
 * the service expects `null` (not `undefined`) for those two fields. The
 * other two body fields (`selectedCandidateIds`, `isAbstention`) pass through
 * unchanged; the service handles `undefined` for those.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `castElectionVoteForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { castElectionVoteForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsVoteContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsVoteContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');

    return castElectionVoteForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        selectedCandidateIds: body.selectedCandidateIds,
        isAbstention: body.isAbstention,
        proxyId: body.proxyId ?? null,
        unitId: body.unitId ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
