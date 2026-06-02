/**
 * Contract for `GET /api/v1/admin/access-plans/community/[id]`.
 *
 * Plan A1 drain #178. Platform-admin list of access plans for one community.
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`.
 *
 * `params.id` is the community ID (positive integer). Pre-migration used
 * `Number(id)` + `ValidationError('Invalid community ID')`; the contract uses
 * `z.coerce.number().int().positive()` (standard params validation).
 *
 * Response: `z.array(z.unknown())` — rows include computed `status` and may
 * carry `Date` fields (drain #175 / #172 precedent).
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via `mergeAdminCorsHeaders`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminAccessPlansCommunityListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/admin/access-plans/community/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.array(z.unknown()),
});
