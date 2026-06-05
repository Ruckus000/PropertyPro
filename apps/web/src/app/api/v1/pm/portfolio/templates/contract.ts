/**
 * Route contracts for `/api/v1/pm/portfolio/templates` — GET + POST + PATCH + DELETE.
 *
 * Portfolio-template library management for property managers (PT-PR4). A
 * property manager's personal, user-owned library of reusable site-branding
 * templates (`site_portfolio_templates`, keyed by `owner_user_id`).
 *
 * Auth surface (all methods, enforced in the route's shared `gateUser()`):
 *   requireAuthenticatedUserId
 *     → isPmAdminInAnyCommunity (pm_admin in ≥1 community)
 *     → userHasPortfolioTemplatesAccess (hasSitePortfolioTemplates plan feature)
 * POST additionally checks per-community membership + pm_admin/cam role on the
 * source community before snapshotting its branding.
 *
 * `permission: { resource: 'settings', action }` — `settings` IS in
 * `RBAC_RESOURCES`; the real gate is the PM/plan check in the handler
 * (documented placeholder pattern for PM-only routes, mirrors `pm/site/domain`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

// PortfolioTemplateBranding is an open token map (keys → token values).
const brandingSchema = z.record(z.string(), z.unknown());

const templateSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  siteLogoPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  branding: brandingSchema,
});

export const templatesListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/portfolio/templates',
  request: {},
  response: z.object({ templates: z.array(templateSummarySchema) }),
  permission: { resource: 'settings', action: 'read' },
});

export const templateCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/portfolio/templates',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      name: z.string().min(1).max(100),
    }),
  },
  response: templateSummarySchema,
  permission: { resource: 'settings', action: 'write' },
});

export const templateRenameContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/portfolio/templates',
  request: {
    body: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(100),
    }),
  },
  response: templateSummarySchema,
  permission: { resource: 'settings', action: 'write' },
});

export const templateDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/portfolio/templates',
  request: { body: z.object({ id: z.number().int().positive() }) },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
