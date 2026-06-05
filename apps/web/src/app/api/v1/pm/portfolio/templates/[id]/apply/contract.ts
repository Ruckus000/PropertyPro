/**
 * Route contract for `POST /api/v1/pm/portfolio/templates/[id]/apply` (PT-PR5).
 *
 * Bulk-applies a portfolio template's branding (tokens + wordmark logo) onto a
 * chosen set of the caller's managed communities (one-time push). Returns a
 * per-community result array (the same shape as the PM bulk routes).
 *
 * `permission: { resource: 'settings', action: 'write' }` — the real gate is the
 * PM + plan-feature check in the handler (mirrors `pm/site/domain`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const applyResultSchema = z.object({
  communityId: z.number(),
  communityName: z.string(),
  status: z.enum(['applied', 'failed']),
  reason: z.string().optional(),
});

export const templateApplyContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/portfolio/templates/[id]/apply',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      communityIds: z.array(z.number().int().positive()).min(1).max(200),
    }),
  },
  response: z.object({ results: z.array(applyResultSchema) }),
  permission: { resource: 'settings', action: 'write' },
});
