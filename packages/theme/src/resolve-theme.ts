import type { CommunityTheme } from './types';
import { ALLOWED_FONTS, THEME_DEFAULTS } from './constants';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function isAllowedFont(value: unknown): value is string {
  return typeof value === 'string' && (ALLOWED_FONTS as readonly string[]).includes(value);
}

function isValidCommunityType(value: unknown): value is CommunityTheme['communityType'] {
  return value === 'condo_718' || value === 'hoa_720' || value === 'apartment';
}

/**
 * Resolve a fully typed CommunityTheme from raw JSONB branding data.
 *
 * Accepts the raw JSONB from `communities.branding` (type `unknown` for safety).
 * Invalid or missing fields fall back to THEME_DEFAULTS.
 *
 * Note: This function does NOT convert logoPath to a public URL.
 * Pass a pre-resolved public URL in the `logoUrl` override, or null.
 */
export function resolveTheme(
  branding: unknown,
  communityName: string,
  communityType: string,
  overrides?: { logoUrl?: string | null },
): CommunityTheme {
  const raw = typeof branding === 'object' && branding !== null ? branding : {};

  const b = raw as Record<string, unknown>;

  return {
    primaryColor: isValidHex(b['primaryColor']) ? b['primaryColor'] : THEME_DEFAULTS.primaryColor,
    secondaryColor: isValidHex(b['secondaryColor'])
      ? b['secondaryColor']
      : THEME_DEFAULTS.secondaryColor,
    accentColor: isValidHex(b['accentColor']) ? b['accentColor'] : THEME_DEFAULTS.accentColor,
    fontHeading: isAllowedFont(b['fontHeading']) ? b['fontHeading'] : THEME_DEFAULTS.fontHeading,
    fontBody: isAllowedFont(b['fontBody']) ? b['fontBody'] : THEME_DEFAULTS.fontBody,
    logoUrl: overrides?.logoUrl !== undefined ? overrides.logoUrl : THEME_DEFAULTS.logoUrl,
    communityName: communityName,
    communityType: isValidCommunityType(communityType) ? communityType : 'condo_718',
  };
}
