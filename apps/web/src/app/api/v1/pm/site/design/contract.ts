/**
 * Route contracts for `/api/v1/pm/site/design` (website builder v4, Phase 4).
 *
 * The site's look — layout, colour set, colours, fonts, custom colours — saved
 * as a DRAFT that goes live on Publish (`site-design-service`).
 *
 * The PATCH body reuses the branding route's colour and font validators, so
 * both routes accept exactly the same values. `.strict()` keeps every other
 * branding key (logos, footer, quota) out of reach.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { customCssOverridesSchema, hexColor, allowedFont } from '@/app/api/v1/pm/branding/contract';

const siteLookSchema = z.object({
  layoutId: z.string().nullable().optional(),
  themePresetSlug: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  customCssOverrides: customCssOverridesSchema.nullable().optional(),
});

const siteDesignResponse = z.object({ live: siteLookSchema, draft: siteLookSchema });

export const siteDesignGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/design',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: siteDesignResponse,
  permission: { resource: 'settings', action: 'read' },
});

export const siteDesignPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/design',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        // Checked against the renderable layouts in `site-design-service`.
        layoutId: z.string().min(1).max(80).optional(),
        themePresetSlug: z.string().min(1).max(120).optional(),
        primaryColor: hexColor.optional(),
        secondaryColor: hexColor.optional(),
        accentColor: hexColor.optional(),
        fontHeading: allowedFont.optional(),
        fontBody: allowedFont.optional(),
        customCssOverrides: customCssOverridesSchema.nullable().optional(),
      })
      .strict(),
  },
  response: siteDesignResponse,
  permission: { resource: 'settings', action: 'write' },
});

export type SiteDesignResponse = z.infer<typeof siteDesignResponse>;
