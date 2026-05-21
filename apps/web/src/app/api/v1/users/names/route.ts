/**
 * GET /api/v1/users/names
 *
 * Bulk display-name resolver for board/forum and elections UX. Accepts a
 * comma-separated list of `userId`s in the `ids` query param plus the
 * actor's active `communityId`, and returns a `{ <uuid>: <displayName> }`
 * map for every requested id (falling back to a synthesized "User <prefix>"
 * for ids the community can't resolve).
 *
 * Plan A1 drain (post-pilot drain #2). Input validation (query) and
 * output validation + canonical envelope wrapping are delegated to
 * `runRoute()` from `@propertypro/api-contract`. The wire response is:
 *
 *     { data: { "<uuid>": "Display Name", ... } }
 *
 * Cleanup vs. the previous implementation:
 *   - Dropped the manual `Object.fromEntries(searchParams)` + Zod safeParse
 *     dance — the contract's `query` schema runs in the runner.
 *   - Replaced `parseCommunityIdFromQuery(req)` + mismatch check with a
 *     single `resolveEffectiveCommunityId(req, query.communityId)` call,
 *     matching the document-categories pilot's auth chain.
 *
 * Behavior change: when the `x-community-id` header and the query
 * `communityId` disagree, the response is now 404 ("Community not found",
 * canonical for forged-header / tenant-mismatch via
 * `resolveEffectiveCommunityId`) rather than 400. The pre-migration code
 * also still returned 400 for malformed query (now also 400, via
 * `ContractValidationError`); the security semantics are identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';
import { userNamesContract } from './contract';

export const GET = withErrorHandler(
  runRoute(userNamesContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await requireCommunityMembership(communityId, actorUserId);

    const displayNames = await resolveUserDisplayNames(communityId, query.ids);
    return Object.fromEntries(displayNames);
  }),
);
