/**
 * Route contract for `POST /api/v1/assessments/[id]/generate`.
 *
 * Plan A1 drain #67. Generates assessment line items for the resolved
 * community. **First drain exercising `requireActiveSubscriptionForMutation`**
 * (async subscription gate that runs LAST in the auth chain — after
 * finance/admin-write gates but before the service call).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                       (ASYNC — awaited)
 *     → requireCommunityMembership               (ASYNC — awaited)
 *     → requireFinanceEnabled                    (ASYNC — awaited)
 *     → requireFinanceWritePermission            (sync)
 *     → requireFinanceAdminWrite                 (sync)
 *     → requireActiveSubscriptionForMutation     (ASYNC — awaited; NEW gate type for the drain corpus)
 *     → generateAssessmentLineItemsForCommunity(communityId, assessmentId, actorUserId, dueDate ?? null, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('Assessment ID')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body shape preserved byte-identical from pre-migration:
 *   - `communityId`: positive int (required)
 *   - `dueDate`: optional ISO date string `YYYY-MM-DD` (regex preserved)
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `generateAssessmentLineItemsForCommunity` returns Drizzle rows / aggregate
 * objects that carry `Date` fields; a tight `z.object({...})` schema would
 * `safeParse`-fail against real Date instances before `NextResponse.json`
 * ISO-serializes them (drain #14/#18/#20/#32/#42/#46/#50/#53/#66 precedent).
 *
 * `permission: { resource: 'finances', action: 'write' }` matches the
 * runtime gate inside `requireFinanceWritePermission` (resource is `finances`
 * PLURAL — verified in `packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`
 * (`BadRequestError('Assessment ID is required')` / `parsePositiveInt`) and
 * body validation failures (`ValidationError('Invalid line-item generation payload')`)
 * shift to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const assessmentsGenerateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/assessments/[id]/generate',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});
