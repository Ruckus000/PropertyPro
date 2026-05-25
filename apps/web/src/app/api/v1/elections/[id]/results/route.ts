/**
 * GET /api/v1/elections/[id]/results?communityId=N
 *
 * Returns the aggregate results for the given election.
 *
 * Plan A1 drain #31 (Move 2 bundle): input validation (params + query) and
 * output envelope wrapping delegated to `runRoute()` from
 * `@propertypro/api-contract`. Auth chain preserved verbatim. Wire shape
 * `{ data: results }` byte-identical to pre-migration. Mirrors drain #30
 * but the service call takes only `(communityId, electionId)`.
 *
 * `parseCommunityIdFromQuery` is functionally equivalent to
 * `resolveEffectiveCommunityId(req, query.communityId)` (drain #10 lesson).
 *
 * `requireElectionsEnabled` is synchronous; not awaited.
 *
 * Behavior change: pre-migration used `parsePositiveInt(params?.id ?? '',
 * 'election id')` which threw a bespoke message; Zod path-param coercion now
 * produces the canonical `VALIDATION_ERROR` envelope. Status code (400)
 * unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { getElectionResultsForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsResultsGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(electionsResultsGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'read');

    return await getElectionResultsForCommunity(communityId, params.id);
  }),
);
