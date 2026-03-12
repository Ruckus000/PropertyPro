import type { CommunityTheme } from './types';

export const THEME_DEFAULTS: Omit<CommunityTheme, 'communityName' | 'communityType'> = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
};

export const THEME_CSS_VARS = {
  primaryColor: '--theme-primary',
  primaryColorHover: '--theme-primary-hover',
  secondaryColor: '--theme-secondary',
  accentColor: '--theme-accent',
  fontHeading: '--theme-font-heading',
  fontBody: '--theme-font-body',
  logoUrl: '--theme-logo-url',
  communityName: '--theme-community-name',
} as const;

/**
 * Darken a hex color by a given percentage (0–100).
 * Used to derive hover states from the primary brand color.
 */
export function darkenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const factor = 1 - percent / 100;
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.round((num & 0xff) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const ALLOWED_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Roboto', 'Source Sans 3',
  'Nunito', 'Nunito Sans', 'Poppins', 'Raleway', 'Montserrat',
  'Work Sans', 'DM Sans', 'Plus Jakarta Sans', 'Outfit',
  'Barlow', 'Manrope', 'Urbanist', 'Figtree',
  'Merriweather', 'Lora', 'Playfair Display', 'Source Serif 4',
  'Libre Baskerville', 'Crimson Text', 'EB Garamond',
] as const;
