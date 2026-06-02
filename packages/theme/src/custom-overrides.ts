import { THEME_CSS_VARS, darkenHex, ALLOWED_FONTS } from './constants';

/**
 * Pro+ custom CSS overrides (token allowlist). A structural shape — kept free
 * of a @propertypro/shared import so this package has no upward dependency.
 * The canonical type lives in @propertypro/shared (CommunityBranding).
 */
export interface CustomCssOverridesShape {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  bodyFont?: string;
}

// 6-digit hex, matching the write-path validator (isValidHexColor / the
// branding route's HEX_RE). 3-digit and named colors are rejected.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Generate the subset of theme CSS variables overridden by a community's
 * Pro+ customCssOverrides. Defensive by construction: malformed/illegal
 * values (bad hex, non-allowlisted font) are skipped so a bad jsonb row can
 * never inject arbitrary CSS at render. There is NO raw-CSS path — every
 * output value is a validated token.
 *
 * Spread this AFTER toCssVars(theme) so the Pro overrides win:
 *   const cssVars = { ...toCssVars(theme), ...customCssOverridesToCssVars(o) };
 */
export function customCssOverridesToCssVars(overrides: unknown): Record<string, string> {
  if (!overrides || typeof overrides !== 'object') return {};
  const o = overrides as CustomCssOverridesShape;
  const out: Record<string, string> = {};

  if (typeof o.primaryColor === 'string' && HEX_RE.test(o.primaryColor)) {
    out[THEME_CSS_VARS.primaryColor] = o.primaryColor;
    out[THEME_CSS_VARS.primaryColorHover] = darkenHex(o.primaryColor, 15);
  }
  if (typeof o.secondaryColor === 'string' && HEX_RE.test(o.secondaryColor)) {
    out[THEME_CSS_VARS.secondaryColor] = o.secondaryColor;
  }
  if (typeof o.accentColor === 'string' && HEX_RE.test(o.accentColor)) {
    out[THEME_CSS_VARS.accentColor] = o.accentColor;
  }
  if (
    typeof o.bodyFont === 'string' &&
    (ALLOWED_FONTS as readonly string[]).includes(o.bodyFont)
  ) {
    out[THEME_CSS_VARS.fontBody] = o.bodyFont;
  }

  return out;
}
