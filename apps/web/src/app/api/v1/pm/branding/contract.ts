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
 *     → [optional logo sharp pipeline when logoStoragePath set]
 *     → updateBrandingForCommunity → logAuditEvent → tryAutoComplete
 *
 * ## PATCH writes the LIVE-ONLY branding fields, nothing else
 *
 * Since website builder v4 (#1272/#1273) the site's look — the
 * `SITE_LOOK_FIELDS` in `@propertypro/shared` (layout, colour set, colours,
 * fonts, custom colours) — is a draft that goes live on Publish, saved through
 * `PATCH /api/v1/pm/site/design`. This route used to write those fields
 * straight to the live site; it now accepts only the fields v4 keeps live: the
 * two logos and the email footer.
 *
 * The body is `.strict()` so a look field is a 400, not silently dropped: a
 * caller that still sends `primaryColor` here must find out, rather than see a
 * 200 while nothing changed. Removing `.strict()` is what the route test's
 * look-field cases revert-check.
 *
 * `hexColor`, `allowedFont` and `customCssOverridesSchema` stay exported: the
 * design route and the onboarding website route validate the look with them.
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

export const hexColor = z.string().regex(HEX_RE, 'Must be a 6-digit hex color');
export const allowedFont = z
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

export const patchPmBrandingBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    logoStoragePath: z.string().min(1).max(500).optional(),
    siteLogoStoragePath: z.string().min(1).max(500).optional(),
    customEmailFooter: z.string().max(500).optional(),
  })
  .strict();

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
