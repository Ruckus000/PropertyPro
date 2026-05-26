/**
 * Route contract for `POST /api/v1/polls/[id]/vote`.
 *
 * Plan A1 drain #62. Resident-facing poll vote endpoint — the polls analog of
 * the elections vote drain #50 (PR #454). Auth chain identical except polls
 * uses `requirePollsEnabled` + `requirePollWritePermission` (sync helpers
 * from `@/lib/polls/common`) instead of `requireElectionsEnabled` +
 * `requirePermission('elections', 'write')`.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePollsEnabled (sync — NOT awaited)
 *     → requirePollWritePermission (sync — NOT awaited)
 *     → castPollVoteForCommunity(communityId, pollId, actorUserId,
 *         { selectedOptions }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('poll id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body has ONE required array field:
 *   - `selectedOptions`: array of strings, each trimmed + min(1) + max(240)
 *     chars; the array itself min(1) + max(20) entries. Per-element validation
 *     (trim then bounds-check each entry) runs BEFORE the array-length checks.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `castPollVoteForCommunity` returns a service value that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'polls', action: 'write' }` matches the runtime
 * `requirePollWritePermission(membership)` call (which delegates to
 * `requirePermission(membership, 'polls', 'write')` internally). `polls` IS
 * in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:44`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid vote payload')`) shifts to
 * the canonical `VALIDATION_ERROR` envelope. Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const pollsVoteContract = defineRoute({
  method: 'POST',
  path: '/api/v1/polls/[id]/vote',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      selectedOptions: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});
