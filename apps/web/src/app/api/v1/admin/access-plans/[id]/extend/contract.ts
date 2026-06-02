/**
 * Contract for `POST /api/v1/admin/access-plans/[id]/extend`.
 *
 * Plan A1 drain #180. Platform admin extends free access for an existing plan.
 *
 * Auth: `requirePlatformAdmin()` only — no `resolveEffectiveCommunityId`.
 *
 * `params.id` is the access plan ID (positive integer).
 *
 * Response: `z.unknown()` — handler augments the service row with computed
 * `status` via `computeAccessPlanStatus` (may include `Date` fields).
 *
 * CORS: applied on the outer `withErrorHandler` wrapper via `mergeAdminCorsHeaders`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const extendAccessPlanBodySchema = z.object({
  additionalMonths: z.number().int().min(1).max(60),
  notes: z.string().max(1000).optional(),
});

export const adminAccessPlanExtendContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/access-plans/[id]/extend',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: extendAccessPlanBodySchema,
  },
  response: z.unknown(),
});
