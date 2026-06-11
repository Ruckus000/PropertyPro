/**
 * Route contract for `POST /api/v1/communities/claim-root` (role-v3 Phase 2b).
 *
 * Claim root for one community (`communityId`) or for every rootless community
 * where the caller is a property_manager (`claimAll: true`). The `.refine`
 * requires one of the two.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3, and the
 * contract suite asserts every declared permission is in the matrix / 9-pair
 * allowlist — declaring `roles:write` FAILS CI. The runtime gate is the explicit
 * property_manager + rootless check inside `claimRoot` (the sanctioned PM→root
 * path, spec §3.5).
 *
 * NO `tenantScope`: `claimAll` spans communities, so the route cannot declare a
 * single authoritative tenant id; the single-claim path resolves `communityId`
 * from the body in-handler. `guard:tenant-scope` tolerates a tenantScope-less
 * route (api-patterns.md).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const claimRootBodySchema = z
  .object({
    communityId: z.number().int().positive().optional(),
    claimAll: z.boolean().optional(),
  })
  .refine((b) => b.communityId != null || b.claimAll === true, {
    message: 'communityId or claimAll required',
  });

export const claimRootContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/claim-root',
  request: {
    body: claimRootBodySchema,
  },
  response: z.unknown(),
});
