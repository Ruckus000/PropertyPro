import { defineRoute, z } from '@propertypro/api-contract';

export const listAmenitiesQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const bookingRulesSchema = z.object({
  minDurationMinutes: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  advanceBookingDays: z.number().int().positive().optional(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const createAmenitySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  isBookable: z.boolean().optional(),
  bookingRules: bookingRulesSchema.optional(),
});

export const amenitiesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/amenities',
  request: {
    query: listAmenitiesQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'amenities', action: 'read' },
});

export const amenitiesCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/amenities',
  request: {
    body: createAmenitySchema,
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'write' },
});
