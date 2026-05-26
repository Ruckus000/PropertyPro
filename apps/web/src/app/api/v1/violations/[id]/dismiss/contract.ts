/**
 * Route contract for `POST /api/v1/violations/[id]/dismiss`.
 *
 * Plan A1 drain #65. Admin-facing violation-dismiss endpoint. Mirrors the
 * structure of sibling violation-write routes (resolve/close/etc.).
 *
 * IMPORTANT distinction from sibling `/resolve` (drain #52): this route does
 * NOT call `sanitizeHtml` on `resolutionNotes`. The pre-migration handler
 * passed `parseResult.data.resolutionNotes ?? null` straight to the service
 * with no sanitization step. Drain #65 preserves that behavior verbatim — raw
 * notes flow through as-is (with `?? null` coercion for undefined/null).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — must be awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → dismissViolationForCommunity(communityId, violationId, actorUserId,
 *         resolutionNotes ?? null, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('violation id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body has TWO fields:
 *   - `communityId`: positive int (required)
 *   - `resolutionNotes`: string, max 4000 chars, nullable + optional
 *
 * Service arg shape is POSITIONAL with `resolutionNotes` as the 4th positional
 * arg (not inside an object). The `?? null` coercion preserves the original
 * semantics — undefined/null flow through as `null` to the service.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `dismissViolationForCommunity` returns a Drizzle row with `Date` fields; a
 * tight `z.object({...})` schema would `safeParse`-fail against real Date
 * instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#52 precedent).
 *
 * `permission: { resource: 'violations', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'violations', 'write')` call.
 * `violations` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid dismiss payload')`) shifts to
 * the canonical `VALIDATION_ERROR` envelope. This includes `communityId`
 * validation, which pre-migration surfaced via `parseCommunityIdFromBody` as
 * `BadRequestError('communityId must be a positive integer')` and now flows
 * through the same `VALIDATION_ERROR` envelope as the rest of the body.
 * Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const violationsDismissContract = defineRoute({
  method: 'POST',
  path: '/api/v1/violations/[id]/dismiss',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      resolutionNotes: z.string().max(4000).nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'write' },
});
