/**
 * P3-47: White-label branding shape persisted to communities.branding JSONB.
 *
 * All fields are optional — null/undefined means "use platform default".
 * logoPath is a Supabase Storage path (not a public URL); callers must
 * generate a signed download URL before rendering.
 */
export interface CommunityBranding {
  /** Hex color string, e.g. "#2563EB". Applied as --theme-primary CSS custom property. */
  primaryColor?: string;
  /** Hex color string, e.g. "#6b7280". Applied as --theme-secondary CSS custom property. */
  secondaryColor?: string;
  /** Hex color string for accent highlights. Applied as --theme-accent CSS custom property. */
  accentColor?: string;
  /** Google Font family name for headings, e.g. "Inter". */
  fontHeading?: string;
  /** Google Font family name for body text, e.g. "Open Sans". */
  fontBody?: string;
  /** Supabase Storage path to the processed 400×400 WebP logo. */
  logoPath?: string;
  /** Custom footer text appended to outbound emails. Plain text. */
  customEmailFooter?: string;
  /**
   * Layout id for the public site renderer (PR #1b). Slug from
   * site_layout_metadata. Null/missing falls back to community_type default.
   */
  layoutId?: string | null;
  /**
   * Theme preset slug (PR #5b). References site_theme_presets.slug.
   * Null/missing falls back to the layout's default_preset_slug.
   * Set by the onboarding wizard Step 2 (color & font preset).
   */
  themePresetSlug?: string | null;
  /**
   * Community tagline (PR #5b Step 3). One-liner, ≤ 80 chars. Renders
   * on the public-site hero block alongside the headline.
   */
  tagline?: string | null;
  /**
   * Cumulative bytes consumed by community-site-assets uploads (PR #2).
   * Incremented at finalize, decremented on hard-delete by the
   * account-lifecycle cron. Used to enforce per-plan quotas
   * (siteAssetsQuotaBytes on PlanFeatureConfig).
   */
  assetsBytesUsed?: number;
  /**
   * Pro+ custom CSS overrides (PR #11). Token-allowlist only — NO raw CSS.
   * Applied LAST in the public-site CSS-variable cascade (after the resolved
   * theme), so these win over branding colors/fonts. Gated to the
   * hasSiteCustomCss plan feature at the write path. Null/missing = no
   * overrides (the resolved theme applies unchanged).
   */
  customCssOverrides?: CustomCssOverrides | null;
}

/**
 * Pro+ custom CSS override fields (token allowlist). Every field is an
 * optional, validated token — there is no raw-CSS, selector, or class-name
 * surface. Colors are 6-digit hex; bodyFont is one of the curated
 * ALLOWED_FONTS (validated at the write path, where the font list lives).
 */
export interface CustomCssOverrides {
  /** 6-digit hex, e.g. "#2563EB". Overrides --theme-primary (+ derived hover). */
  primaryColor?: string;
  /** 6-digit hex. Overrides --theme-secondary. */
  secondaryColor?: string;
  /** 6-digit hex. Overrides --theme-accent. */
  accentColor?: string;
  /** Curated Google Font family. Overrides --theme-font-body. */
  bodyFont?: string;
}

/** Default branding colors used when no community branding is configured. */
export const DEFAULT_PRIMARY_COLOR = '#2563EB';
export const DEFAULT_SECONDARY_COLOR = '#6B7280';

/** Validates a string is a 6-digit hex color (with leading #). */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
