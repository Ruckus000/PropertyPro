/**
 * Elections — election detail
 *
 * GET /api/v1/elections/[id]?communityId=N
 *
 * Plan A1 bundle drain #32. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → requireElectionsEnabled (sync, NOT awaited)
 *   → requirePermission('elections', 'read')
 *   → getElectionDetailForCommunity(communityId, electionId)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` / missing
 * or non-numeric `communityId` shifts to the canonical `VALIDATION_ERROR`
 * envelope. Status unchanged. Success wire shape `{ data: election }`
 * byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { getElectionDetailForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsDetailGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(electionsDetailGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'read');

    return getElectionDetailForCommunity(communityId, params.id);
  }),
);
