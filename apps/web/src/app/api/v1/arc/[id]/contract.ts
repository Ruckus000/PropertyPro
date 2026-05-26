/**
 * Route contract for `GET /api/v1/arc/[id]`.
 *
 * Plan A1 drain #68. ARC (Architectural Review Committee) submission
 * detail-getter — read endpoint that returns a single ARC submission for
 * a community, optionally filtered to the resident actor's owned units.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC — MUST await)
 *     → requirePermission('arc_submissions', 'read')
 *     → conditional getActorUnitIds (residents only)
 *     → getArcSubmissionForCommunity(communityId, id, residentUnitIds)
 *
 * `parseCommunityIdFromQuery(req)` (which validated the required
 * `communityId` query param then delegated to `resolveEffectiveCommunityId`)
 * is now expressed as Zod query validation + an explicit
 * `resolveEffectiveCommunityId(req, query.communityId)` call inside the
 * handler. `parsePositiveInt('ARC submission id')` is now expressed via
 * Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Conditional resident-unit-filter preserved verbatim in the handler:
 *   - residents (role + isResidentRole(role)) → `await getActorUnitIds(scoped, actorUserId)`
 *     passed as 3rd arg.
 *   - admins/staff → 3rd arg is `undefined`.
 *
 * Query:
 *   - `communityId`: positive int (coerced from string). Required.
 *     Reconciled with `x-community-id` header inside the handler via
 *     `resolveEffectiveCommunityId` (canonical pattern; 404 on mismatch,
 *     formerly 400 via `parseCommunityIdFromQuery`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `getArcSubmissionForCommunity` returns a Drizzle row that carries
 * `Date` fields (`createdAt`, `decidedAt`, etc.); a tight `z.object({...})`
 * schema would `safeParse`-fail against real Date instances before
 * `NextResponse.json` ISO-serializes them (drain #14/#18/#20/#42/#50/#51
 * precedent).
 *
 * `permission: { resource: 'arc_submissions', action: 'read' }` matches
 * the runtime `requirePermission(membership, 'arc_submissions', 'read')`
 * call. `arc_submissions` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 envelope for invalid `[id]`
 * (was `BadRequestError`, now canonical `VALIDATION_ERROR`); invalid /
 * missing `communityId` (was `BadRequestError` from `parseCommunityIdFromQuery`,
 * now `VALIDATION_ERROR`). Status code unchanged at 400. Success wire
 * shape `{ data: T }` byte-identical.
 *
 * This route does NOT call `assertNotDemoGrace` (GET reads pass through
 * demo grace; preserves pre-migration behavior).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const arcDetailContract = defineRoute({
  method: 'GET',
  path: '/api/v1/arc/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'read' },
});
