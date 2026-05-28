/**
 * Route contracts for `PATCH` and `DELETE /api/v1/faqs/[id]`.
 *
 * Plan A1 drain #112. Admin-only FAQ detail mutations. Mirrors collection
 * drain #104 (`/api/v1/faqs`) auth and audit patterns.
 *
 * PATCH auth surface (preserved verbatim):
 *   params.id (Zod) → body parse
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireAuthenticatedUserId
 *     → requireCommunityMembership
 *     → membership.isAdmin gate
 *     → updateFaq + logAuditEvent
 *
 * DELETE auth surface:
 *   params.id (Zod) → query.communityId
 *     → resolveEffectiveCommunityId
 *     → assertNotDemoGrace
 *     → requireAuthenticatedUserId
 *     → requireCommunityMembership
 *     → membership.isAdmin gate
 *     → softDeleteFaq + logAuditEvent
 *
 * PATCH response: loose `z.unknown()` — `updateFaq` row may carry `Date`
 * fields (drain #104 precedent). DELETE response: tight
 * `z.object({ id: z.number().int().positive() })` — handler synthesizes
 * `{ id }` with no Dates.
 *
 * `permission` uses `settings` placeholders — FAQs are not in
 * `RBAC_RESOURCES`; admin gate is inline `membership.isAdmin`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const faqsUpdateBodySchema = z.object({
  communityId: z.number().int().positive(),
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(5000).optional(),
});

export const faqsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/faqs/[id]',
  request: {
    params: paramsSchema,
    body: faqsUpdateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});

export const faqsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/faqs/[id]',
  request: {
    params: paramsSchema,
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({
    id: z.number().int().positive(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
