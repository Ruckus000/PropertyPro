/**
 * Route contract for `GET /api/v1/visitors/my`.
 *
 * Plan A1 drain #105. Resident-only view of the actor's visitors within a
 * community. Optional `filter` query (`active` | `upcoming` | `past`) is
 * parsed manually in the handler — NOT in the Zod schema — so unknown
 * values fall back to the default `listMyVisitorsForCommunity` behavior.
 *
 * Auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled (async)
 *     → requireVisitorsReadPermission (sync)
 *     → isResidentRole gate
 *     → createScopedClient + requireActorUnitIds
 *     → list service branch by filter
 *
 * Response: non-paginated array wrapped as `{ data: VisitorRow[] }`.
 * `passCode` is stripped in the handler before return. Rows use loose
 * `z.unknown()` items because `VisitorLogRow` carries `Date` fields.
 *
 * `permission: { resource: 'visitors', action: 'read' }` matches runtime
 * `requireVisitorsReadPermission`. `visitors` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const visitorsMyContract = defineRoute({
  method: 'GET',
  path: '/api/v1/visitors/my',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.array(z.unknown()),
  permission: { resource: 'visitors', action: 'read' },
});
