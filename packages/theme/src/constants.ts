import type { CommunityTheme } from './types';

export const ALLOWED_FONTS = [
  // Sans-serif — general purpose
  'Inter',
  'Open Sans',
  'Lato',
  'Roboto',
  'Source Sans 3',
  'Nunito',
  'Nunito Sans',
  'Poppins',
  'Raleway',
  'Montserrat',
  'Work Sans',
  'DM Sans',
  'Plus Jakarta Sans',
  'Outfit',

  // Sans-serif — slightly distinctive
  'Barlow',
  'Manrope',
  'Urbanist',
  'Figtree',

  // Serif — formal / traditional
  'Merriweather',
  'Lora',
  'Playfair Display',
  'Source Serif 4',
  'Libre Baskerville',
  'Crimson Text',
  'EB Garamond',
] as const;

export type AllowedFont = (typeof ALLOWED_FONTS)[number];

/** Platform default theme — derived from the landing page palette. */
export const THEME_DEFAULTS: Omit<CommunityTheme, 'communityName' | 'communityType'> = {
  primaryColor: '#2563EB',   // blue-600
  secondaryColor: '#6B7280', // gray-500
  accentColor: '#DBEAFE',    // blue-100
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
};

/** Maps CommunityTheme keys → CSS custom property names. Single source of truth. */
export const THEME_CSS_VARS: Record<keyof Omit<CommunityTheme, 'communityType'>, string> = {
  primaryColor: '--theme-primary',
  secondaryColor: '--theme-secondary',
  accentColor: '--theme-accent',
  fontHeading: '--theme-font-heading',
  fontBody: '--theme-font-body',
  logoUrl: '--theme-logo-url',
  communityName: '--theme-community-name',
};
