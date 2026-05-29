/**
 * Route contract for `GET /api/v1/payments/statement`.
 *
 * Plan A1 drain #133. Unit or community finance statement.
 *
 * GET uses `parseCommunityIdFromQuery` in-handler (finance pattern #128).
 * `unitId`, `startDate`, and `endDate` parsed manually in-handler.
 *
 * Response: `{ mode, statement }` — inner payload for runner wrap (B1 Slice 3).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const paymentStatementContract = defineRoute({
  method: 'GET',
  path: '/api/v1/payments/statement',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({
    mode: z.enum(['unit', 'community']),
    statement: z.unknown(),
  }),
  permission: { resource: 'finances', action: 'read' },
});
