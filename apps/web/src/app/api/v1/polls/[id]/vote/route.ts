/**
 * Polls — cast a vote (resident-facing).
 *
 * POST /api/v1/polls/[id]/vote
 * Body: { communityId, selectedOptions: string[] }
 *
 * Plan A1 drain #62. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved
 * verbatim — note this is a RESIDENT-facing endpoint and intentionally has
 * NO admin-role gate:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePollsEnabled (sync, NOT awaited)
 *     → requirePollWritePermission (sync, NOT awaited)
 *     → castPollVoteForCommunity(communityId, pollId, actorUserId,
 *         { selectedOptions }, x-request-id)
 *
 * Array body validation: `selectedOptions` is an array of trimmed strings,
 * each 1-240 chars, with the array itself 1-20 entries. Per-element
 * validation runs before the array-length bounds in Zod's pipeline.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `castPollVoteForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requirePollWritePermission,
  requirePollsEnabled,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { castPollVoteForCommunity } from '@/lib/services/polls-service';
import { pollsVoteContract } from './contract';

export const POST = withErrorHandler(
  runRoute(pollsVoteContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollWritePermission(membership);

    return castPollVoteForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        selectedOptions: body.selectedOptions,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
