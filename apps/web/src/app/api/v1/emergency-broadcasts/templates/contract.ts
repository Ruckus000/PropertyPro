/**
 * GET /api/v1/emergency-broadcasts/templates — pre-built emergency-broadcast
 * templates for the community.
 *
 * Query: { communityId }. No body. No params.
 *
 * Auth chain (4 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → requirePermission(membership,
 * 'emergency_broadcasts', 'read') → return EMERGENCY_TEMPLATES.
 *
 * Response modeling: loose z.unknown() — `EMERGENCY_TEMPLATES` is a static
 * constant array; loose modeling matches the bundle convention and avoids
 * coupling the contract to constant shape.
 *
 * permission.action must be 'read' — RBAC_ACTIONS only has 'read' | 'write'.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastsTemplatesGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/emergency-broadcasts/templates',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.unknown(),
  permission: { resource: 'emergency_broadcasts', action: 'read' },
});
