/**
 * Contracts for `/api/v1/admin/access-plans` (GET list + POST grant).
 *
 * Plan A1 auto-drain. Platform-admin endpoints; auth is `requirePlatformAdmin()`
 * only — NOT community membership. Both methods preserve their pre-migration
 * wire shape (`{ data: ... }`) byte-identical.
 *
 * GET — list access plans, optional `communityId` query filter.
 *   - Pre-migration read `communityId` from `searchParams` and threw
 *     `ValidationError('communityId must be a positive integer')` when present
 *     but non-positive/non-numeric. The contract declares `communityId` as an
 *     optional `z.coerce.number().int().positive()` query param, which 400s on
 *     `communityId=abc` / `communityId=0` (matching the old guard) and treats
 *     an absent param as "list all". The runner collapses empty-string params
 *     (`?communityId=`) to undefined, so that case also lists all.
 *   - Response: `z.array(z.unknown())` — rows carry `Date` fields (expiresAt,
 *     graceEndsAt, ...) plus a computed `status`, so a tight schema would
 *     safeParse-fail. Loose array per drain #178 precedent.
 *
 * POST — grant free access to a community.
 *   - Body mirrors the pre-migration `grantBodySchema` exactly, including
 *     `gracePeriodDays` default of 30. `notes` is optional (service signature
 *     is `notes?: string`, so no `?? null` coercion).
 *   - The `communityExistsAdmin` "Community not found" check stays a business
 *     rule inside the handler (not a contract-layer validation).
 *   - Response: `z.unknown()` — the synthesized `{ ...plan, status }` object
 *     carries `Date` fields from the Drizzle row.
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via
 * `mergeAdminCorsHeaders`; the OPTIONS handler is re-exported from the route.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminAccessPlansListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/admin/access-plans',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.array(z.unknown()),
});

export const adminAccessPlansGrantContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/access-plans',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      durationMonths: z.number().int().min(1).max(60),
      gracePeriodDays: z.number().int().min(0).max(365).optional().default(30),
      notes: z.string().max(1000).optional(),
    }),
  },
  response: z.unknown(),
});
