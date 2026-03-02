/**
 * P3-47: White-label branding shape persisted to communities.branding JSONB.
 *
 * All fields are optional — null/undefined means "use platform default".
 * logoPath is a Supabase Storage path (not a public URL); callers must
 * generate a signed download URL before rendering.
 */
export interface CommunityBranding {
  /** Hex color string, e.g. "#1a56db". Applied as --theme-primary CSS custom property. */
  primaryColor?: string;
  /** Hex color string, e.g. "#6b7280". Applied as --theme-secondary CSS custom property. */
  secondaryColor?: string;
  /** Supabase Storage path to the processed 400×400 WebP logo. */
  logoPath?: string;
}

/** Validates a string is a 6-digit hex color (with leading #). */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
