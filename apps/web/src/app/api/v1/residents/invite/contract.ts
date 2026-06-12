/**
 * Route contract for `POST /api/v1/residents/invite`.
 *
 * Plan A1 drain #140. Atomically create resident + send invitation.
 *
 * Auth: resolveEffectiveCommunityId → assertNotDemoGrace → requireAuthenticatedUserId
 * → requireCommunityMembership → requirePermission(residents, write).
 *
 * Role-v3 invariant 3 (root-manager simplification §3.5): resident-minting
 * paths can never write a manager-tier role — only root mints
 * property_manager. The `role` field is therefore narrowed to the literal
 * 'resident' (owner vs tenant is expressed via `isUnitOwner`), and `presetKey`
 * is gone: presets only apply to manager-tier rows, which this path may not
 * create. Manager access is assigned exclusively from the root-only
 * Roles & Access screen.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createAndInviteBodySchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.literal('resident'),
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional().default(false),
  ttlDays: z.number().int().positive().default(7),
  sendInvitation: z.boolean().optional().default(true),
});

export const residentsInvitePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/residents/invite',
  request: {
    body: createAndInviteBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
});
