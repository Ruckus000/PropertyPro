/**
 * Route contract for /api/v1/pm/onboarding/website. Plan A1.
 */
import { defineRoute, z } from '@propertypro/api-contract';

// 6-digit hex with leading #, e.g. "#0e3338"
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color');

const wizardPatchBodySchema = z
  .object({
    communityId: z.number().int().positive(),
    layoutId: z.string().min(1).max(80).nullable().optional(),
    themePresetSlug: z.string().min(1).max(120).nullable().optional(),
    tagline: z.string().max(80).nullable().optional(),
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    accentColor: hexColorSchema.optional(),
    fontHeading: z.string().min(1).max(80).optional(),
    fontBody: z.string().min(1).max(80).optional(),
  })
  .refine(
    (b) =>
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
