/**
 * Route contract for /api/v1/pm/onboarding/website. Plan A1.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { allowedFont, hexColor as hexColorSchema } from '@/app/api/v1/pm/branding/contract';

const wizardPatchBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    /** Community display name — writes communities.name with an audit entry. */
    name: z.string().trim().min(1).max(200).optional(),
    // Checked against the renderable layouts in `site-design-service`.
    layoutId: z.string().min(1).max(80).nullable().optional(),
    themePresetSlug: z.string().min(1).max(120).nullable().optional(),
    tagline: z.string().max(80).nullable().optional(),
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    accentColor: hexColorSchema.optional(),
    // Same font allowlist as the design and branding routes: these now become
    // the site's drafted look, published as-is.
    fontHeading: allowedFont.optional(),
    fontBody: allowedFont.optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.layoutId !== undefined ||
      b.themePresetSlug !== undefined ||
      b.tagline !== undefined ||
      b.primaryColor !== undefined ||
      b.secondaryColor !== undefined ||
      b.accentColor !== undefined ||
      b.fontHeading !== undefined ||
      b.fontBody !== undefined,
    { message: 'At least one wizard field must be supplied' },
  );

const brandingResponseSchema = z.object({
  layoutId: z.string().nullable(),
  themePresetSlug: z.string().nullable(),
  tagline: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  accentColor: z.string().nullable(),
  fontHeading: z.string().nullable(),
  fontBody: z.string().nullable(),
});

export const wizardPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/onboarding/website',
  request: {
    body: wizardPatchBodySchema,
  },
  response: z.object({ branding: brandingResponseSchema }),
  permission: { resource: 'settings', action: 'write' },
});
