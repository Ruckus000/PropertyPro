/**
 * Route contract for `/api/v1/pm/site/domain/check` — GET.
 *
 * Guided-purchase availability check: is the domain the PM wants available
 * to register, and roughly what does it cost? Read-only — the app never
 * registers domains; the PM buys at their own registrar and returns to the
 * connect flow (POST /api/v1/pm/site/domain).
 *
 * Auth surface mirrors the sibling domain routes (shared `gate()` shape):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireRole(PM_MANAGER_ROLES)
 *     → requirePlanFeature('hasSiteCustomDomain')
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const domainCheckContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/domain/check',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      name: z.string().min(3).max(253),
    }),
  },
  response: z.object({
    /** The sanitized hostname that was checked. */
    name: z.string(),
    available: z.boolean(),
    /** Indicative registration price (USD) — null when unknown. */
    price: z.number().nullable(),
    /** Years the price covers — null when unknown. */
    period: z.number().nullable(),
  }),
  permission: { resource: 'settings', action: 'read' },
});
