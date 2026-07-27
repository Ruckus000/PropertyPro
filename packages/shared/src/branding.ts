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
  /** Supabase Storage path to the processed 400×400 WebP logo (avatar/auth). */
  logoPath?: string;
  /**
   * Supabase Storage path to the processed wordmark logo (≤600×180 WebP,
   * aspect preserved) shown in the public-site header. Separate from logoPath
   * so the square avatar and the horizontal wordmark can differ.
   */
  siteLogoPath?: string;
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
  /**
   * Website editor v3, Phase 8 — PM-authored SEO overrides.
   *
   * Unstaged and live-immediate, like every other field on this object: the
   * publish flow promotes `site_blocks` rows only, so a change here is public
   * on the next request.
   *
   * NOTE this interface describes what is *persisted*, and the column is
   * untyped `jsonb` — it is not a guarantee about what is in any given row.
   * Readers must go through `resolveSiteSettings`
   * (`apps/web/src/lib/site-editor/site-settings.ts`), which type-checks every
   * field, rather than trusting this shape.
   */
  siteSettings?: SiteSettingsBranding | null;
  /** Website editor v3, Phase 8 — PM-authored public-site footer. */
  siteFooter?: SiteFooterBranding | null;
}

/** Persisted SEO overrides. Every field optional; absent means "derive it". */
export interface SiteSettingsBranding {
  /** Overrides the derived `<title>`. */
  seoTitle?: string | null;
  /** Overrides the derived meta description. */
  seoDescription?: string | null;
  /**
   * Whether search engines may index this community's public pages.
   *
   * Absent means indexable. Only an explicit `false` de-indexes — see
   * `isSearchIndexingEnabled`, where that default is enforced and tested.
   */
  searchIndexing?: boolean;
  /** Processed variants, written by the favicon finalize route. */
  favicon?: { icon32Path: string; appleTouch180Path: string } | null;
}

/** Persisted public-site footer fields. */
export interface SiteFooterBranding {
  /** Overrides the community name in the copyright line. */
  associationName?: string | null;
  /** Free-text line under the copyright. Rendered as text, never as HTML. */
  note?: string | null;
  /**
   * The opt-in statutory records line. Defaults to false and must stay
   * opt-in: PropertyPro presents factual data and does not assess compliance
   * adequacy, so a line a community could read as the platform certifying its
   * statutory compliance is exactly the claim to avoid. See
   * `.claude/rules/florida-compliance.md` and the gap analysis §5.
   */
  showStatutoryLine?: boolean;
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

/** Default branding colors used when no community branding is configured.
 *  Primary is the "Florida Modern" coral that matches the marketing landing
 *  page (see packages/theme THEME_DEFAULTS). */
export const DEFAULT_PRIMARY_COLOR = '#C2533A';
export const DEFAULT_SECONDARY_COLOR = '#6B7280';

/** Validates a string is a 6-digit hex color (with leading #). */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
