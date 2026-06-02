/**
 * Route contract for `POST /api/v1/delinquency/[unitId]/waive`.
 *
 * Plan A1 drain #80. Waives late fees for a delinquent unit. **First drain
 * with `[unitId]` (NOT `[id]`) path param** — `params` schema key matches the
 * Next.js dynamic segment name verbatim.
 *
 * Auth surface (preserved verbatim from pre-migration handler — mirrors
 * drain #67 assessments/[id]/generate):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                       (ASYNC — awaited)
 *     → requireCommunityMembership               (ASYNC — awaited)
 *     → requireFinanceEnabled                    (ASYNC — awaited)
 *     → requireFinanceWritePermission            (sync)
 *     → requireFinanceAdminWrite                 (sync)
 *     → requireActiveSubscriptionForMutation     (ASYNC — awaited)
 *     → waiveLateFeesForUnit(communityId, unitId, actorUserId, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt(rawUnitId, 'unitId')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `waiveLateFeesForUnit` returns objects that may carry `Date` fields; a
 * tight `z.object({...})` schema would `safeParse`-fail against real Date
 * instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#67 precedent).
 *
 * `permission: { resource: 'finances', action: 'write' }` matches the runtime
 * gate inside `requireFinanceWritePermission` (resource is `finances`
 * PLURAL — verified in `packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[unitId]`
 * (`BadRequestError('unitId route parameter is required')` /
 * `parsePositiveInt`) and body validation failures
 * (`ValidationError('Invalid waive-late-fees payload')`) shift to the
 * canonical `VALIDATION_ERROR` envelope. Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const delinquencyWaiveContract = defineRoute({
  method: 'POST',
  path: '/api/v1/delinquency/[unitId]/waive',
  request: {
    params: z.object({
      unitId: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});
