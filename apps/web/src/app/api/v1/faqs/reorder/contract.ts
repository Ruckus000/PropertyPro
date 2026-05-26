/**
 * Route contract for `PATCH /api/v1/faqs/reorder`.
 *
 * Plan A1 drain #73 — body-only PATCH that reorders all FAQs for a community.
 * Body shape: `{ communityId, ids: number[] }`. Response echoes the new order
 * back: `{ ids: number[] }` (wrapped by the runner as `{ data: { ids } }` on
 * the wire — byte-identical to the pre-migration response envelope).
 *
 * Authorization (enforced in the handler, preserved verbatim from
 * pre-migration):
 *   - `resolveEffectiveCommunityId(req, body.communityId)` reconciles the
 *     `x-community-id` header with the body's `communityId`
 *   - `assertNotDemoGrace(communityId)` blocks demo-grace tenants
 *   - `requireAuthenticatedUserId` resolves the session user
 *   - `requireCommunityMembership` enforces tenant membership
 *   - Inline `membership.isAdmin` gate (admin-only mutation)
 *
 * Note on auth ordering: the pre-migration handler ran `safeParse` first,
 * then `resolveEffectiveCommunityId → assertNotDemoGrace →
 * requireAuthenticatedUserId → requireCommunityMembership`. Under the
 * runner, body validation still happens first (the runner's Zod parse
 * replaces the inline `safeParse`); the remaining gates run in the same
 * order inside the handler body. Functionally equivalent.
 *
 * Inline business validations preserved in the handler:
 *   - Duplicate FAQ IDs in the array → `ValidationError('Duplicate FAQ IDs
 *     in reorder list')`
 *   - `reorderFaqs` callback fires `ValidationError(\`FAQ with id ${id}
 *     not found or not active in this community\`)` if any id is missing
 *
 * Audit log: `logAuditEvent({ action: 'faq.reordered', resourceType: 'faq',
 * resourceId: 'bulk', ... })` is called after `reorderFaqs` resolves.
 *
 * `permission` field is OMITTED: there is no `faqs` resource in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`), and the admin
 * gate is enforced inline via `membership.isAdmin` rather than through the
 * RBAC matrix. Adding a placeholder would be misleading.
 *
 * Response modeling: tight `z.object({ ids: z.array(z.number().int()
 * .positive()) })` is safe because the response is constructed in-handler
 * from the validated input `body.ids` — no service-layer Date fields or
 * unknown shapes to runner-`safeParse` against.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const faqsReorderContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/faqs/reorder',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      ids: z.array(z.number().int().positive()),
    }),
  },
  response: z.object({
    ids: z.array(z.number().int().positive()),
  }),
});
