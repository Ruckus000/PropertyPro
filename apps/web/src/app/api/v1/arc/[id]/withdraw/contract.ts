/**
 * Route contract for `POST /api/v1/arc/[id]/withdraw`.
 *
 * Plan A1 drain #61. Resident-facing ARC withdraw endpoint — distinct from
 * sibling ARC admin write routes (approve/deny) in that the auth chain ends
 * with `requireArcSubmitterRole(membership)` (resident submitter only) rather
 * than an ARC-admin gate. Closest precedent is drain #50 elections vote
 * (PR #454) for the resident-write pattern, with an added in-handler
 * `createScopedClient` + `getActorUnitIds` step that flows into the service
 * call as the 4th positional argument.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC — must be awaited)
 *     → requirePermission('arc_submissions', 'write')
 *     → requireArcSubmitterRole (sync)
 *     → createScopedClient(communityId) (sync)
 *     → getActorUnitIds(scoped, actorUserId) (async — must be awaited)
 *     → withdrawArcSubmissionForCommunity(communityId, id, actorUserId,
 *         unitIds, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('ARC submission id')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * SCOPED DB CALL: this route is one of the small set whose handler does an
 * in-handler scoped query (`createScopedClient(communityId)` + the async
 * `getActorUnitIds(scoped, actorUserId)`) before calling the service. The
 * service signature accepts the resolved `unitIds: number[]` as its 4th
 * positional argument; the contract preserves this exactly. `getActorUnitIds`
 * is the re-export of `listActorUnitIds` (async) from
 * `@/lib/units/actor-units`.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `withdrawArcSubmissionForCommunity` returns a service value (Drizzle row)
 * carrying `Date` fields; a tight `z.object({...})` schema would
 * `safeParse`-fail against real Date instances before `NextResponse.json`
 * ISO-serializes them (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'arc_submissions', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'arc_submissions', 'write')` call.
 * `arc_submissions` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid ARC withdraw payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const arcWithdrawContract = defineRoute({
  method: 'POST',
  path: '/api/v1/arc/[id]/withdraw',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'write' },
});
