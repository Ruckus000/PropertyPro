/**
 * Route contract for `POST /api/v1/residents/invite`.
 *
 * Plan A1 drain #140. Atomically create resident + send invitation.
 *
 * Auth: resolveEffectiveCommunityId → assertNotDemoGrace → requireAuthenticatedUserId
 * → requireCommunityMembership → requirePermission(residents, write).
 *
 * Hybrid-model rules (`presetKey`, apartment owner guard) stay in-handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { NEW_COMMUNITY_ROLES, PRESET_KEYS, type NewCommunityRole, type PresetKey } from '@propertypro/shared';

const createAndInviteBodySchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(NEW_COMMUNITY_ROLES) as z.ZodType<NewCommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional().default(false),
  presetKey: (z.enum(PRESET_KEYS as unknown as [string, ...string[]]) as z.ZodType<PresetKey>).optional(),
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
