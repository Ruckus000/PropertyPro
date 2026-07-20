/**
 * Route contracts for `GET`, `POST`, `PATCH`, and `DELETE /api/v1/residents`.
 *
 * Plan A1 drain #134. Residents CRUD with audit logging and role validation.
 *
 * GET: `communityId` in contract query; `role` / `roles` filters parsed manually
 * in-handler (invalid values throw `ValidationError` — preserved messages).
 *
 * POST/PATCH/DELETE: body validated by contract; `resolveEffectiveCommunityId`
 * applied in-handler after auth on mutations.
 */
import {
  COMMUNITY_ROLES,
  type CommunityRole,
} from '@propertypro/shared';
import { defineRoute, z } from '@propertypro/api-contract';

const createResidentBodySchema = z.object({
  communityId: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().nullable().optional(),
  role: z.enum(COMMUNITY_ROLES as unknown as [string, ...string[]]) as z.ZodType<CommunityRole>,
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional().default(false),
});

const updateResidentBodySchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: (z.enum(COMMUNITY_ROLES as unknown as [string, ...string[]]) as z.ZodType<CommunityRole>).optional(),
  unitId: z.number().int().positive().nullable().optional(),
  isUnitOwner: z.boolean().optional(),
});

const deleteResidentBodySchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
});

export const residentsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/residents',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'read' },
  tenantScope: { in: 'query' },
});

export const residentsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/residents',
  request: {
    body: createResidentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});

export const residentsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/residents',
  request: {
    body: updateResidentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});

export const residentsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/residents',
  request: {
    body: deleteResidentBodySchema,
  },
  response: z.object({
    success: z.literal(true),
  }),
  permission: { resource: 'residents', action: 'write' },
  tenantScope: { in: 'body' },
});
