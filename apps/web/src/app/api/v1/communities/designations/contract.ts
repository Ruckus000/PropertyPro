/**
 * Route contract for `POST /api/v1/communities/designations` (role-v3
 * Phase 2c). The root_manager sets or clears a board designation
 * (board_president | board_member | null) for a community member.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3
 * (declaring `roles:write` fails the contract suite). The runtime gate is the
 * explicit root-identity check in the handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const designationBodySchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
  designation: z.enum(['board_president', 'board_member']).nullable(),
  acknowledgeNonOwner: z.boolean().optional(),
});

export const setDesignationContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/designations',
  request: { body: designationBodySchema },
  response: z.unknown(),
  tenantScope: { in: 'body' },
});
