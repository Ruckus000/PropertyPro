/**
 * Route contract for `GET /api/v1/amenities/[id]/schedule`.
 *
 * Plan A1 bundle drain #33. Five-gate auth chain (auth + membership +
 * amenities-enabled + plan-feature + amenities:read). Loose
 * `z.unknown()` response — `getAmenityScheduleForCommunity` returns
 * an object that includes Date fields (reservation timestamps); a
 * tight schema would `safeParse`-fail before NextResponse.json runs
 * (drain #14/#18 precedent).
 *
 * `permission: { resource: 'amenities', action: 'read' }` — `amenities`
 * IS in RBAC_RESOURCES. The runtime permission check happens inside
 * `requireAmenitiesReadPermission`; this metadata documents intent.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const amenitiesScheduleGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/amenities/[id]/schedule',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'read' },
});
