/**
 * Route contract for `GET /api/v1/visitors/denied/match`.
 *
 * Plan A1 drain #85. Staff-operator denied-visitor match endpoint.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsReadPermission (sync)
 *     → requireStaffOperator           (sync)
 *     → matchDeniedVisitors(communityId, name ?? null, plate ?? null)
 *
 * Pre-migration `parseCommunityIdFromQuery(req)` (which threw
 * `BadRequestError` on missing query) is now expressed as a required
 * `communityId` query field plus an explicit
 * `resolveEffectiveCommunityId(req, query.communityId)` call inside the
 * handler. Missing/invalid `communityId` now yields a canonical 400
 * `VALIDATION_ERROR` envelope (same status code).
 *
 * `name` / `plate` are optional string filters. Zod coerces missing
 * search params to `undefined`; the handler converts `undefined` → `null`
 * to preserve the `matchDeniedVisitors` service contract.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `matchDeniedVisitors` returns Drizzle rows carrying `Date` fields; a
 * tight `z.object({...})` schema would `safeParse`-fail against real Date
 * instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#53 precedent).
 *
 * `permission: { resource: 'visitors', action: 'read' }` matches the
 * runtime gate inside `requireVisitorsReadPermission`. `visitors` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const visitorsDeniedMatchContract = defineRoute({
  method: 'GET',
  path: '/api/v1/visitors/denied/match',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      name: z.string().optional(),
      plate: z.string().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'read' },
});
