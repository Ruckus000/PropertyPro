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
  secondaryColor: '--theme-secondary',
  accentColor: '--theme-accent',
  fontHeading: '--theme-font-heading',
  fontBody: '--theme-font-body',
  logoUrl: '--theme-logo-url',
  communityName: '--theme-community-name',
} as const;

export const ALLOWED_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Roboto', 'Source Sans 3',
  'Nunito', 'Nunito Sans', 'Poppins', 'Raleway', 'Montserrat',
  'Work Sans', 'DM Sans', 'Plus Jakarta Sans', 'Outfit',
  'Barlow', 'Manrope', 'Urbanist', 'Figtree',
  'Merriweather', 'Lora', 'Playfair Display', 'Source Serif 4',
  'Libre Baskerville', 'Crimson Text', 'EB Garamond',
] as const;
