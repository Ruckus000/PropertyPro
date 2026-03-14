/**
 * Theme injection tests for the mobile layout.
 *
 * Verifies that the theme utilities (used by MobileLayout) correctly produce:
 * - CSS variable maps containing --theme-primary
 * - Google Fonts <link> href values
 * - Correct defaults when no custom branding is provided
 */
import { describe, expect, it } from 'vitest';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';

describe('Mobile theme injection — resolveTheme', () => {
  it('returns default primary color when branding is null', () => {
    const theme = resolveTheme(null, 'Sunset Condos', 'condo_718');
    expect(theme.primaryColor).toBe('#2563EB');
  });

  it('returns default primary color when branding is undefined', () => {
    const theme = resolveTheme(undefined, 'Palm Shores HOA', 'hoa_720');
    expect(theme.primaryColor).toBe('#2563EB');
  });

  it('picks up custom primaryColor from branding', () => {
    const theme = resolveTheme(
      { primaryColor: '#1D4ED8', secondaryColor: '#374151' },
      'Ocean View Condos',
      'condo_718',
    );
    expect(theme.primaryColor).toBe('#1D4ED8');
  });

  it('rejects invalid hex colors and falls back to default', () => {
    const theme = resolveTheme(
      { primaryColor: 'javascript:alert(1)' },
      'Bad Actor HOA',
      'hoa_720',
    );
    expect(theme.primaryColor).toBe('#2563EB');
  });

  it('rejects invalid font names and falls back to Inter', () => {
    const theme = resolveTheme(
      { fontHeading: 'Comic Sans MS' },
      'Retro Condos',
      'condo_718',
    );
    expect(theme.fontHeading).toBe('Inter');
  });

  it('accepts valid font names from the allowlist', () => {
    const theme = resolveTheme(
      { fontHeading: 'Poppins', fontBody: 'Lato' },
      'Modern Residences',
      'apartment',
    );
    expect(theme.fontHeading).toBe('Poppins');
    expect(theme.fontBody).toBe('Lato');
  });

  it('sets communityName and communityType on the theme', () => {
    const theme = resolveTheme(null, 'Sunset Ridge Apartments', 'apartment');
    expect(theme.communityName).toBe('Sunset Ridge Apartments');
    expect(theme.communityType).toBe('apartment');
  });
});

describe('Mobile theme injection — toCssVars', () => {
  it('maps primaryColor to --theme-primary CSS variable', () => {
    const theme = resolveTheme({ primaryColor: '#FF5500' }, 'Test Community', 'condo_718');
    const cssVars = toCssVars(theme);
    expect(cssVars['--theme-primary']).toBe('#FF5500');
  });

  it('includes default --theme-primary when no custom branding', () => {
    const theme = resolveTheme(null, 'Default Community', 'condo_718');
    const cssVars = toCssVars(theme);
    expect(cssVars['--theme-primary']).toBe('#2563EB');
  });

  it('includes all required CSS variable keys', () => {
    const theme = resolveTheme(null, 'Test', 'condo_718');
    const cssVars = toCssVars(theme);
    expect(cssVars).toHaveProperty('--theme-primary');
    expect(cssVars).toHaveProperty('--theme-secondary');
    expect(cssVars).toHaveProperty('--theme-accent');
    expect(cssVars).toHaveProperty('--theme-font-heading');
    expect(cssVars).toHaveProperty('--theme-font-body');
    expect(cssVars).toHaveProperty('--theme-logo-url');
    expect(cssVars).toHaveProperty('--theme-community-name');
  });

  it('sets logo-url to "none" when logoUrl is null', () => {
    const theme = resolveTheme(null, 'No Logo Community', 'hoa_720');
    const cssVars = toCssVars(theme);
    expect(cssVars['--theme-logo-url']).toBe('none');
  });
});

describe('Mobile theme injection — toFontLinks', () => {
  it('returns empty array for default Inter font (self-hosted via next/font)', () => {
    const theme = resolveTheme(null, 'Default', 'condo_718');
    const links = toFontLinks(theme);
    expect(links).toHaveLength(0);
  });

  it('returns separate font links for different heading and body fonts', () => {
    const theme = resolveTheme(
      { fontHeading: 'Poppins', fontBody: 'Lato' },
      'Two Fonts',
      'condo_718',
    );
    const links = toFontLinks(theme);
    expect(links).toHaveLength(2);
    expect(links.some((l) => l.includes('Poppins'))).toBe(true);
    expect(links.some((l) => l.includes('Lato'))).toBe(true);
  });

  it('deduplicates when heading and body fonts are the same', () => {
    const theme = resolveTheme(
      { fontHeading: 'Roboto', fontBody: 'Roboto' },
      'Same Font',
      'condo_718',
    );
    const links = toFontLinks(theme);
    expect(links).toHaveLength(1);
  });
});
