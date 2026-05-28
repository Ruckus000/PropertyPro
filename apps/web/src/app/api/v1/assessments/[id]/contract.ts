/**
 * Route contracts for `/api/v1/assessments/[id]` — PATCH + DELETE.
 *
 * Plan A1 drain #92. Two-method route file mirroring the GET+PATCH /
 * GET+DELETE patterns from prior drains (#13, #22, #88) — but here both
 * methods are mutations on the same finance resource. PATCH carries a
 * body, DELETE carries only a query (`communityId`), per the pre-migration
 * `parseCommunityIdFromBody` / `parseCommunityIdFromQuery` split.
 *
 * Auth chain (BOTH methods, verbatim from pre-migration):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId (was parseCommunityIdFromBody /
 *      parseCommunityIdFromQuery — both delegate here; drain #10 lesson)
 *   → assertNotDemoGrace (async)
 *   → requireCommunityMembership (async)
 *   → requireFinanceEnabled (ASYNC — must `await`)
 *   → requireFinanceWritePermission (sync — calls
 *      `requirePermission(membership, 'finances', 'write')` internally)
 *   → requireFinanceAdminWrite (sync — checks `membership.isAdmin`)
 *   → requireActiveSubscriptionForMutation (ASYNC — must `await`)
 *   → service
 *
 * Four-gate auth chain: financeEnabled (async) + write-perm (sync) +
 * admin-write (sync) + active-subscription (async). Order preserved exactly;
 * the empty-updates `BadRequestError` check fires BEFORE any auth so a
 * malformed empty PATCH still returns 400 (not 401/403), matching the
 * pre-migration ordering: actorUserId resolves first, then param parsing,
 * then body validation, then the empty-updates guard, then community
 * resolution + gates. The runner runs Zod body validation before invoking
 * the handler closure, so once we land inside the closure the body is
 * already-typed UpdateAssessmentInput; we then enforce the "at least one
 * field" rule via `BadRequestError('At least one field must be provided
 * for update')` — message preserved byte-identical.
 *
 * PATCH response: loose `z.unknown()`. `updateAssessmentForCommunity`
 * returns `AssessmentRecord`, which has `createdAt: Date` and
 * `updatedAt: Date` fields. A tight schema would `safeParse`-fail at
 * runtime because the runner validates the handler return BEFORE
 * `NextResponse.json` serializes the Date to ISO. Drain #14/#18/#22
 * precedent.
 *
 * DELETE response: tight `z.object({ success: z.literal(true) })`.
 * Handler synthesizes the literal — no Date concerns. Drain #17/#22
 * precedent (single literal-shaped ack).
 *
 * `parsePositiveInt(rawId, 'Assessment ID')` becomes
 * `z.coerce.number().int().positive()` on `params.id`. The pre-migration
 * `BadRequestError('Assessment ID is required')` (empty path segment) and
 * the `parsePositiveInt` 400 (non-numeric / non-positive) all collapse
 * into a single runner 400 `VALIDATION_ERROR` — semantically equivalent.
 *
 * `permission: { resource: 'finances', action: 'write' }` for both
 * methods. `finances` (plural) is in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:41`) and matches the runtime
 * `requirePermission(membership, 'finances', 'write')` call inside
 * `requireFinanceWritePermission`. Non-placeholder.
 *
 * Behavior change vs. pre-migration:
 *   - Pre-migration used `parseCommunityIdFromBody` (PATCH) and
 *     `parseCommunityIdFromQuery` (DELETE). Both helpers already delegate
 *     to `resolveEffectiveCommunityId` under the hood (drain #10 lesson),
 *     so header/query/body mismatch behavior is unchanged.
 *   - 400 envelopes become canonical `VALIDATION_ERROR` — status unchanged.
 *   - DELETE `communityId` query was previously parsed by
 *     `parseCommunityIdFromQuery` (returns `number` or throws). The
 *     contract uses `z.coerce.number().int().positive()` which yields the
 *     same shape; a missing or zero/negative `communityId` continues to
 *     return 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().positive().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']).optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  lateFeeAmountCents: z.number().int().min(0).optional(),
  lateFeeDaysGrace: z.number().int().min(0).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

const deleteQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const assessmentUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/assessments/[id]',
  request: {
    params: paramsSchema,
    body: updateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});

export const assessmentDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/assessments/[id]',
  request: {
    params: paramsSchema,
    query: deleteQuerySchema,
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'finances', action: 'write' },
});
