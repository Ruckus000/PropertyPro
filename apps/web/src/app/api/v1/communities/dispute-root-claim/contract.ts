/**
 * Route contract for `POST /api/v1/communities/dispute-root-claim` (role-v3
 * Phase 2b). A property_manager who believes a root claim was wrong opens a
 * dispute that surfaces in the platform-admin queue.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3 (the
 * contract suite would fail a declared `roles:write`). The runtime gate is the
 * explicit property_manager membership check in the handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const disputeRootClaimBodySchema = z.object({
  communityId: z.number().int().positive(),
});

export const disputeRootClaimContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/dispute-root-claim',
  request: {
    body: disputeRootClaimBodySchema,
  },
  response: z.unknown(),
  tenantScope: { in: 'body' },
});
