/**
 * Route contract for `POST /api/v1/violations/[id]/fine`.
 *
 * Plan A1 drain #77. Admin-facing violation-fine endpoint. Mirrors the auth
 * chain of sibling drain #65 (`/dismiss`) but with a richer body shape.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — must be awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → imposeViolationFineForCommunity(communityId, violationId, actorUserId,
 *         { amountCents, dueDate, graceDays, notes ?? null }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('violation id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body fields:
 *   - `communityId`: positive int (required)
 *   - `amountCents`: positive int (required)
 *   - `dueDate`: ISO date string `YYYY-MM-DD` (optional)
 *   - `graceDays`: int in [1, 120] (optional)
 *   - `notes`: string, max 1000 chars, nullable + optional
 *
 * Service arg shape is POSITIONAL with a `{ amountCents, dueDate, graceDays,
 * notes }` options object as the 4th positional arg. The `notes ?? null`
 * coercion preserves the original semantics — undefined/null flow through as
 * `null` to the service; `dueDate` and `graceDays` retain their `undefined`
 * sentinel when omitted.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `imposeViolationFineForCommunity` returns a Drizzle row with `Date` fields;
 * a tight `z.object({...})` schema would `safeParse`-fail against real Date
 * instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#52/#65 precedent).
 *
 * `permission: { resource: 'violations', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'violations', 'write')` call.
 * `violations` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid fine payload')`) shifts to
 * the canonical `VALIDATION_ERROR` envelope. This includes `communityId`
 * validation, which pre-migration surfaced via `parseCommunityIdFromBody` as
 * `BadRequestError('communityId must be a positive integer')` and now flows
 * through the same `VALIDATION_ERROR` envelope as the rest of the body.
 * Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const violationsFineContract = defineRoute({
  method: 'POST',
  path: '/api/v1/violations/[id]/fine',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      amountCents: z.number().int().positive(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      graceDays: z.number().int().min(1).max(120).optional(),
      notes: z.string().max(1000).nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'write' },
});
