import { defineRoute, z } from '@propertypro/api-contract';

export const reservationsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/reservations',
  request: {
    query: z.object({
      communityId: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  response: z.object({
    data: z.array(z.unknown()),
    meta: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().min(0),
    }),
  }),
  permission: { resource: 'amenities', action: 'read' },
});
