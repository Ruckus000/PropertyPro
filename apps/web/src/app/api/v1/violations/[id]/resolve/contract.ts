/**
 * Route contract for `POST /api/v1/violations/[id]/resolve`.
 *
 * Plan A1 drain #52. Admin-facing violation-resolve endpoint. Mirrors the
 * structure of sibling violation-write routes (close/dismiss/etc.) and shares
 * the in-handler `sanitizeHtml` step with drain #2's precedent for free-form
 * note fields — HTML sanitization happens INSIDE the handler (post-Zod
 * validation, pre-service-call) and is NOT expressible in the contract
 * schema.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (ASYNC — must be awaited)
 *     → requirePermission('violations', 'write')
 *     → requireViolationAdminWrite (sync, isAdmin gate)
 *     → resolveViolationForCommunity(communityId, violationId, actorUserId,
 *         sanitizedNotes, x-request-id)
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
 * The `!= null` conditional in the handler preserves the original `?? null`
 * coercion semantics — `undefined` or `null` resolutionNotes flow through as
 * `null` to the service; a non-null string is passed through `sanitizeHtml`
 * (sync) before the service call.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `resolveViolationForCommunity` returns a Drizzle row with `Date` fields; a
 * tight `z.object({...})` schema would `safeParse`-fail against real Date
 * instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'violations', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'violations', 'write')` call.
 * `violations` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid resolve payload')`) shifts to
 * the canonical `VALIDATION_ERROR` envelope. Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const violationsResolveContract = defineRoute({
  method: 'POST',
  path: '/api/v1/violations/[id]/resolve',
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
