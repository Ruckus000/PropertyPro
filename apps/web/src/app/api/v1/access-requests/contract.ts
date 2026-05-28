/**
 * Route contracts for `GET` and `POST /api/v1/access-requests`.
 *
 * Plan A1 drain #113. Public self-service submit + admin paginated list.
 *
 * POST is public (no session) — registered in TOKEN_AUTH_ROUTES. No auth
 * gates in the handler; contract validates body only.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('residents', 'write')
 *     → paginatePendingAccessRequests({ communityId, cursor, pageSize })
 *
 * `cursor` and `pageSize` are parsed manually in the handler from `req.url`
 * (NOT in the Zod query schema) so empty-string query params (`?cursor=`,
 * `?pageSize=`) are treated as missing via `||` rather than failing Zod
 * `min(1)` / `positive()` constraints (regression from pre-migration).
 *
 * GET response: `paginated: true` with loose `z.unknown()` rows.
 * POST response: loose `z.object({ requestId, resent })` shape via
 * `z.unknown()` because service return is stable but kept loose per corpus
 * convention for small public POST endpoints.
 *
 * `permission` metadata: GET uses `residents`/`write` (matches runtime);
 * POST uses `residents`/`write` placeholder (no runtime RBAC on public POST).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessRequestsSubmitBodySchema = z.object({
  communityId: z.number().int().positive(),
  communitySlug: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  claimedUnitNumber: z.string().max(100).optional(),
  isUnitOwner: z.boolean().default(false),
  refCode: z.string().max(50).optional(),
});

export const accessRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/access-requests',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'residents', action: 'write' },
});

export const accessRequestsSubmitContract = defineRoute({
  method: 'POST',
  path: '/api/v1/access-requests',
  request: {
    body: accessRequestsSubmitBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
});
