/**
 * GET /api/v1/polls/[id]/results
 *
 * Returns the aggregate results for a single poll — the poll record,
 * total vote count, and per-option vote counts / percentages. Consumed
 * by `useBoardPollResults` in `apps/web/src/hooks/use-board.ts` via
 * `requestJson<PollResults>` (which strips the `{data}` envelope).
 *
 * Plan A1 drain #14. Direct clone of drain #11 (polls/[id]/my-vote) —
 * same params+query input shape through the contract runner, same
 * multi-gate polls auth chain. Only the terminal service call differs:
 * `getPollResultsForCommunity(communityId, pollId)` (aggregate) vs.
 * drain #11's `getMyPollVoteForCommunity(communityId, pollId, userId)`
 * (actor's own vote — note the 3rd userId arg is NOT used here).
 *
 * Authorization chain (preserved verbatim):
 *   1. `requireAuthenticatedUserId()` — Supabase session.
 *   2. `resolveEffectiveCommunityId(req, query.communityId)` —
 *      reconciles `x-community-id` header + query communityId;
 *      throws 404 on mismatch / forged headers. This replaces the
 *      pre-migration `parseCommunityIdFromQuery(req)` call, which
 *      ALREADY delegated to `resolveEffectiveCommunityId` internally
 *      (`apps/web/src/lib/finance/request.ts:17`), so the header/query
 *      mismatch behavior was ALREADY 404 pre-migration — no wire
 *      behavior change there.
 *   3. `requireCommunityMembership(communityId, userId)` — 403 on
 *      non-members.
 *   4. `requirePollsEnabled(membership)` — 403 if the polls feature
 *      is disabled for the community.
 *   5. `requirePollReadPermission(membership)` — RBAC read gate.
 *   6. `getPollResultsForCommunity(communityId, pollId)` — note the
 *      service throws `NotFoundError('Poll not found')` for unknown
 *      poll ids, surfacing as a 404 through `withErrorHandler`.
 *
 * Behavior change vs. pre-migration: invalid `id` and missing /
 * non-positive `communityId` 400s now carry the runner's canonical
 * `VALIDATION_ERROR` envelope (was hand-constructed `BadRequestError`
 * via `parsePositiveInt` / `parseCommunityIdFromQuery`). Status codes
 * are unchanged. The wire response shape (`{ data: PollResults }`) is
 * unchanged — `requestJson<PollResults>` in the consumer sees the same
 * payload it always did.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePollReadPermission, requirePollsEnabled } from '@/lib/polls/common';
import { getPollResultsForCommunity } from '@/lib/services/polls-service';
import { pollResultsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(pollResultsContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollReadPermission(membership);

    return await getPollResultsForCommunity(communityId, params.id);
  }),
);
