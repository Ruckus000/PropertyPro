/**
 * GET /api/v1/polls/[id]/my-vote
 *
 * Returns the current actor's vote for a single poll (or
 * `{ hasVoted: false, selectedOptions: [] }` if they haven't voted).
 * Consumed by `useBoardPollMyVote` in `apps/web/src/hooks/use-board.ts`
 * via `requestJson<PollMyVote>` (which strips the `{data}` envelope).
 *
 * Plan A1 drain #11. Mirrors drain #3 (ledger/balance/[unitId]) —
 * params+query input through the contract runner — but with a polls
 * auth chain (feature-flag gate + RBAC gate) instead of finance's
 * owner-vs-staff branching.
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
 *   4. `requirePollsEnabled(membership)` — 403 if polls feature is
 *      disabled for the community.
 *   5. `requirePollReadPermission(membership)` — RBAC read gate.
 *   6. `getMyPollVoteForCommunity(communityId, pollId, userId)`.
 *
 * Behavior change vs. pre-migration: invalid `id` and missing /
 * non-positive `communityId` 400s now carry the runner's canonical
 * `VALIDATION_ERROR` envelope (was hand-constructed `BadRequestError`).
 * Status codes are unchanged. The wire response shape (`{ data: { hasVoted,
 * selectedOptions } }`) is unchanged — `requestJson<PollMyVote>` in the
 * consumer sees the same `PollMyVote` payload.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePollReadPermission, requirePollsEnabled } from '@/lib/polls/common';
import { getMyPollVoteForCommunity } from '@/lib/services/polls-service';
import { pollMyVoteContract } from './contract';

export const GET = withErrorHandler(
  runRoute(pollMyVoteContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollReadPermission(membership);

    return await getMyPollVoteForCommunity(communityId, params.id, actorUserId);
  }),
);
