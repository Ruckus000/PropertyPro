/**
 * Route contracts for `GET`, `POST`, `PATCH`, and `DELETE /api/v1/units`.
 *
 * Plan A1 drain #136. Units CRUD with audit logging and apartment rent rules.
 *
 * GET: `communityId` in contract query; `resolveEffectiveCommunityId` in-handler.
 * POST/PATCH/DELETE: body validated by contract; tenant resolution in-handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createUnitBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitNumber: z.string().min(1, 'Unit number is required'),
  building: z.string().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  sqft: z.number().int().min(0).nullable().optional(),
  rentAmount: z.string().nullable().optional(),
});

const updateUnitBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  unitNumber: z.string().min(1).optional(),
  building: z.string().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  sqft: z.number().int().min(0).nullable().optional(),
  rentAmount: z.string().nullable().optional(),
});

const deleteUnitBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
});

export const unitsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/units',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'read' },
});

export const unitsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/units',
  request: {
    body: createUnitBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
});

export const unitsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/units',
  request: {
    body: updateUnitBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
});

export const unitsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/units',
  request: {
    body: deleteUnitBodySchema,
  },
  response: z.object({
    success: z.literal(true),
  }),
  permission: { resource: 'units', action: 'write' },
});
