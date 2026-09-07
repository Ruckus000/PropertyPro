/**
 * Route contracts for `/api/v1/pm/site/domain` — GET + POST + DELETE.
 *
 * Custom-domain management for property managers (PR5).
 *
 * Auth surface (all methods, enforced in the route's shared `gate()`):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireRole(PM_MANAGER_ROLES)
 *     → requirePlanFeature('hasSiteCustomDomain')
 *
 * `permission: { resource: 'settings', action }` — `settings` IS in
 * `RBAC_RESOURCES`; the runner does NOT enforce it. The real gate is the
 * `requireRole(PM_MANAGER_ROLES)` call in the handler's `gate()`
 * (property_manager / root_manager) — the documented placeholder pattern for
 * PM-only routes. `pm/branding` lands on the same role set a different way: it
 * inlines `PM_SCOPE_DB_ROLES.includes(...)` instead of calling `requireRole`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const dnsRecord = z.object({ type: z.string(), name: z.string(), value: z.string() });

export const domainStateSchema = z.object({
  domain: z.string().nullable(),
  status: z.enum(['pending', 'active', 'error']).nullable(),
  verifiedAt: z.string().nullable(),
  records: z.array(dnsRecord),
  reason: z.string().nullable(),
});

export const domainGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/domain',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: domainStateSchema,
  permission: { resource: 'settings', action: 'read' },
});

export const domainSetContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/domain',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      domain: z.string().min(1).max(253),
    }),
  },
  response: domainStateSchema,
  permission: { resource: 'settings', action: 'write' },
});

export const domainDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/domain',
  request: { body: z.object({ communityId: z.number().int().positive() }) },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
