/**
 * Route contract for `GET /api/v1/meetings/[id]`.
 *
 * Plan A1 bundle drain #37. Meeting detail w/ attached documents.
 * Loose `z.unknown()` response — the payload is an object that includes
 * Date-derived ISO strings + dynamic `serializeMeetingResponse` output;
 * loose modeling is the standard for routes with nested Date fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const meetingsDetailGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/meetings/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'meetings', action: 'read' },
});
