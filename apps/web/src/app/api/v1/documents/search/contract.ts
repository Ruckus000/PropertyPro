/**
 * Route contract for `GET /api/v1/documents/search`.
 *
 * Plan A1 drain #143. Paginated document search with custom cursor metadata
 * (`nextCursor` + `limit`, not canonical `pageSize`/`hasMore`).
 *
 * Non-paginated contract: handler returns `{ data: rows, pagination }`; the
 * runner single-wraps to `{ data: { data, pagination } }` (B1 envelope).
 *
 * `q` has no `.min(1)` — empty/short queries are valid at the contract layer;
 * service handles ranking/filtering.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const documentSearchQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  q: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  mimeType: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const documentSearchResponseSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z.object({
    nextCursor: z.number().nullable(),
    limit: z.number(),
  }),
});

export const documentSearchContract = defineRoute({
  method: 'GET',
  path: '/api/v1/documents/search',
  request: {
    query: documentSearchQuerySchema,
  },
  response: documentSearchResponseSchema,
  permission: { resource: 'documents', action: 'read' },
});
