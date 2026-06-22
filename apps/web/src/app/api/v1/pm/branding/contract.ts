/**
 * Route contracts for `/api/v1/pm/branding` — GET + PATCH.
 *
 * Plan A1 drain #174. White-label branding for property managers.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → membership.role is property_manager-tier else ForbiddenError
 *     → getBrandingForCommunity → `{}` when null
 *
 * PATCH auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → membership.role is property_manager-tier
 *     → [optional requirePlanFeature when customCssOverrides touched]
 *     → [optional logo sharp pipeline when logoStoragePath set]
 *     → updateBrandingForCommunity → logAuditEvent → tryAutoComplete
 *
 * PR #11 — `customCssOverrides` uses `.strict()` on the nested object; unknown
 * keys are rejected at the schema layer (token-allowlist sanitization boundary).
 *
 * Response: loose `z.unknown()` — branding payloads may evolve additively and
 * the service return type is a partial community branding projection.
 *
 * `permission: { resource: 'settings', action: 'read' | 'write' }` — `settings`
 * IS in `RBAC_RESOURCES`; the real gate is the property_manager-tier role
 * check in the handler (documented placeholder pattern for PM-only routes).
 *
 * Behavior change vs. pre-migration: invalid query/body shapes return the
 * runner's `VALIDATION_ERROR` envelope (was hand-constructed ValidationError
 * with `formatZodErrors`). Status unchanged (400). Header/query reconciliation
 * already used `resolveEffectiveCommunityId` pre-migration — no 404 delta.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { ALLOWED_FONTS } from '@propertypro/theme';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const allowedFontsArray = ALLOWED_FONTS as readonly string[];

const hexColor = z.string().regex(HEX_RE, 'Must be a 6-digit hex color');
const allowedFont = z
  .string()
  .refine((v) => allowedFontsArray.includes(v), { message: 'Must be an allowed font family' });

export const customCssOverridesSchema = z
  .object({
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.optional(),
    accentColor: hexColor.optional(),
    bodyFont: allowedFont.optional(),
  })
  .strict();

export const patchPmBrandingBodySchema = z.object({
  communityId: z.number().int().positive(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  fontHeading: allowedFont.optional(),
  fontBody: allowedFont.optional(),
  logoStoragePath: z.string().min(1).max(500).optional(),
  siteLogoStoragePath: z.string().min(1).max(500).optional(),
  customEmailFooter: z.string().max(500).optional(),
  customCssOverrides: customCssOverridesSchema.nullable().optional(),
});

export type PatchPmBrandingBody = z.infer<typeof patchPmBrandingBodySchema>;

export const getPmBrandingContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/branding',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});

export const patchPmBrandingContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/branding',
  request: {
    body: patchPmBrandingBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});
