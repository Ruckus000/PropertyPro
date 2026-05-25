/**
 * GET /api/v1/elections/[id]/my-vote?communityId=N
 *
 * Returns the actor's vote receipt for the given election.
 *
 * Plan A1 drain #30 (Move 2 bundle): input validation (params + query) and
 * output envelope wrapping delegated to `runRoute()` from
 * `@propertypro/api-contract`. Auth chain preserved verbatim. Wire shape
 * `{ data: receipt }` byte-identical to pre-migration.
 *
 * `parseCommunityIdFromQuery` is functionally equivalent to
 * `resolveEffectiveCommunityId(req, query.communityId)` — the former
 * delegates to the latter (drain #10 lesson) — so header-mismatch behavior
 * is preserved.
 *
 * `requireElectionsEnabled` is synchronous (see `apps/web/src/lib/elections/
 * common.ts`); not awaited.
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
import { getMyElectionVoteReceiptForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsMyVoteGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(electionsMyVoteGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'read');

    return await getMyElectionVoteReceiptForCommunity(communityId, params.id, actorUserId);
  }),
);
