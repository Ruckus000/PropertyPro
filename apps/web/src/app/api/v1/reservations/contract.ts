import { defineRoute, z } from '@propertypro/api-contract';

const reservationItemSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  amenityId: z.number().int().positive(),
  userId: z.string(),
  unitId: z.number().int().positive().nullable(),
  startTime: z.date(),
  endTime: z.date(),
  status: z.enum(['confirmed', 'cancelled']),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const reservationsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/reservations',
  request: {},
  response: z.object({
    data: z.array(reservationItemSchema),
    meta: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().min(0),
    }),
  }),
  permission: { resource: 'amenities', action: 'read' },
});
