/**
 * Route contract for `POST /api/v1/help/view`.
 *
 * Plan A1 drain #110. Append-only analytics view tracking; returns
 * `{ ok: true }` (runner wraps to `{ data: { ok: true } }`).
 *
 * Response schema is tight — handler synthesizes the literal boolean.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const postHelpViewContract = defineRoute({
  method: 'POST',
  path: '/api/v1/help/view',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      articleSlug: z.string().min(1).max(200),
      articleCategory: z.string().min(1).max(100),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
