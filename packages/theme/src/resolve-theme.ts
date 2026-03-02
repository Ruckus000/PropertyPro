import { ALLOWED_FONTS, THEME_DEFAULTS } from './constants';
import type { CommunityTheme } from './types';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : fallback;
}

function resolveFont(value: unknown): string {
  return typeof value === 'string' && ALLOWED_FONTS.includes(value as (typeof ALLOWED_FONTS)[number])
    ? value
    : 'Inter';
}

export function resolveTheme(
  branding: unknown,
  communityName: string,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): CommunityTheme {
  if (!isRecord(branding)) {
    return {
      ...THEME_DEFAULTS,
      communityName,
      communityType,
    };
  }

  return {
    primaryColor: resolveColor(branding.primaryColor, THEME_DEFAULTS.primaryColor),
    secondaryColor: resolveColor(branding.secondaryColor, THEME_DEFAULTS.secondaryColor),
    accentColor: resolveColor(branding.accentColor, THEME_DEFAULTS.accentColor),
    fontHeading: resolveFont(branding.fontHeading),
    fontBody: resolveFont(branding.fontBody),
    logoUrl: typeof branding.logoUrl === 'string' ? branding.logoUrl : null,
    communityName,
    communityType,
  };
}
