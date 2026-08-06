/**
 * Shared Zod refinements for branding input.
 *
 * These were declared independently in three route files
 * (`demos/route.ts`, `communities/[id]/branding/route.ts`,
 * `demos/[id]/community/branding/route.ts`) and were missing entirely from a
 * fourth, `demos/preview/route.ts`. The divergence was the bug: the preview
 * route accepted bare `z.string()` for all three colors and both fonts while
 * its sibling create route enforced these, and those strings are interpolated
 * into JavaScript source that `compile-template.ts` hands to `new Function()`.
 *
 * All four now import from here. `demos/route.ts` composes `HEX_COLOR` /
 * `THEME_FONT` directly rather than `brandingSchema`, because creation
 * REQUIRES every branding field while the PATCH routes take them optionally.
 *
 * Validation here is defence in depth, not the primary control. The primary
 * control is `escapeForJsStringLiteral` in
 * `lib/site-template/compile-template.ts`, applied to every context value at
 * the single point they enter `template.build()`. Both layers are needed: an
 * allowlist cannot cover `communityName` / `prospectName`, which are
 * necessarily free text.
 */
import { z } from 'zod';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';

/** `#RRGGBB` only. */
export const HEX_COLOR = z
  .string()
  .refine(isValidHexColor, { message: 'Must be a hex color (#RRGGBB)' });

/** One of the fonts the theme package actually ships. */
export const THEME_FONT = z
  .string()
  .refine((f) => (ALLOWED_FONTS as readonly string[]).includes(f), {
    message: 'Font not in the allowed list',
  });

/** The five branding fields, all optional. */
export const brandingSchema = z.object({
  primaryColor: HEX_COLOR.optional(),
  secondaryColor: HEX_COLOR.optional(),
  accentColor: HEX_COLOR.optional(),
  fontHeading: THEME_FONT.optional(),
  fontBody: THEME_FONT.optional(),
});
