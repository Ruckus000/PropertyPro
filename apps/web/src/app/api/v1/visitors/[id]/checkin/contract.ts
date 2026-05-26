/**
 * Route contract for `PATCH /api/v1/visitors/[id]/checkin`.
 *
 * Plan A1 drain #53. Staff-operator visitor check-in endpoint. NOTE: HTTP
 * method is PATCH (not POST) — visitor check-in is conceptually a state
 * mutation on an existing visitor record, per the pre-migration source.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsWritePermission (sync — wraps `requirePermission(membership, 'visitors', 'write')`)
 *     → requireStaffOperator           (sync)
 *     → checkInVisitorForCommunity(communityId, visitorId, actorUserId, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('visitor id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body is minimal: just `{ communityId }`. The visitor id comes from the
 * `[id]` path segment.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `checkInVisitorForCommunity` returns a Drizzle row that carries `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'visitors', action: 'write' }` matches the
 * runtime gate inside `requireVisitorsWritePermission`. `visitors` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid visitor check-in payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const visitorsCheckinContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/visitors/[id]/checkin',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'write' },
});
