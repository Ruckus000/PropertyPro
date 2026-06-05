/**
 * Portfolio-template branding capture. A template stores only the token subset
 * of a community's branding (colors, fonts, layout, theme preset, tagline,
 * custom CSS, email footer). Logo assets are handled separately (the template
 * row's site_logo_path + a copied storage object), and per-community quota
 * (assetsBytesUsed) is never templated.
 */
import type { CommunityBranding } from '../branding';

/** The branding fields a portfolio template captures (no logos, no quota). */
export type PortfolioTemplateBranding = Pick<
  CommunityBranding,
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'fontHeading'
  | 'fontBody'
  | 'customEmailFooter'
  | 'layoutId'
  | 'themePresetSlug'
  | 'tagline'
  | 'customCssOverrides'
>;

const TEMPLATE_BRANDING_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'fontHeading',
  'fontBody',
  'customEmailFooter',
  'layoutId',
  'themePresetSlug',
  'tagline',
  'customCssOverrides',
] as const satisfies readonly (keyof PortfolioTemplateBranding)[];

/** Pick the captured token subset from a community's branding (omitting unset fields). */
export function extractTemplateBranding(branding: CommunityBranding): PortfolioTemplateBranding {
  const out: Record<string, unknown> = {};
  for (const key of TEMPLATE_BRANDING_KEYS) {
    if (branding[key] !== undefined) {
      out[key] = branding[key];
    }
  }
  return out as PortfolioTemplateBranding;
}

/**
 * Merge a template's captured tokens onto a target community's branding. The
 * captured tokens win; the target's logo paths and assetsBytesUsed (which the
 * template never carries) are preserved. Caller sets siteLogoPath separately
 * after copying the logo asset.
 */
export function mergeTemplateBranding(
  target: CommunityBranding,
  template: PortfolioTemplateBranding,
): CommunityBranding {
  return { ...target, ...template };
}
