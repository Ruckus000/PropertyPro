/**
 * Route contracts for `/api/v1/faqs` — GET (paginated list) + POST (create).
 *
 * Plan A1 drain #104. Migrated from legacy `withErrorHandler` handlers.
 *
 * GET auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → ensureFaqsExist(communityId)
 *     → listVisibleFaqsPage(communityId, membership.role, { cursor, pageSize })
 *
 * POST auth surface:
 *   resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireAuthenticatedUserId
 *     → requireCommunityMembership
 *     → membership.isAdmin gate (runtime — NOT RBAC matrix)
 *     → createFaq + logAuditEvent
 *
 * `permission` metadata uses `settings` read/write placeholders. FAQs are
 * not in `RBAC_RESOURCES`; POST is gated by `membership.isAdmin` in the
 * handler. The runner does not enforce permission metadata today.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const faqsListQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const faqsCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
});

export type FaqsCreateBody = z.infer<typeof faqsCreateBodySchema>;

export const faqsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/faqs',
  request: {
    query: faqsListQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'settings', action: 'read' },
});

export const faqsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/faqs',
  request: {
    body: faqsCreateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});
