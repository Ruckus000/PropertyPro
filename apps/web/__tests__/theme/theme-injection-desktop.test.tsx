/**
 * Theme injection tests for the authenticated (desktop) layout.
 *
 * Verifies the same theme utilities work correctly in the desktop context,
 * with different community types (condo_718, hoa_720, apartment).
 */
import { describe, expect, it } from 'vitest';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';

describe('Desktop theme injection — resolveTheme with community types', () => {
  it('works for condo_718 community type', () => {
    const theme = resolveTheme({ primaryColor: '#1E40AF' }, 'Sunset Condos', 'condo_718');
    expect(theme.communityType).toBe('condo_718');
    expect(theme.primaryColor).toBe('#1E40AF');
  });

  it('works for hoa_720 community type', () => {
    const theme = resolveTheme({ primaryColor: '#15803D' }, 'Palm Shores HOA', 'hoa_720');
    expect(theme.communityType).toBe('hoa_720');
    expect(theme.primaryColor).toBe('#15803D');
  });

  it('works for apartment community type', () => {
    const theme = resolveTheme({ primaryColor: '#7C3AED' }, 'City Heights Apts', 'apartment');
    expect(theme.communityType).toBe('apartment');
    expect(theme.primaryColor).toBe('#7C3AED');
  });

  it('falls back gracefully when branding is an empty object', () => {
    const theme = resolveTheme({}, 'Minimal Community', 'condo_718');
    expect(theme.primaryColor).toBe('#2563EB');
    expect(theme.fontHeading).toBe('Inter');
    expect(theme.fontBody).toBe('Inter');
  });

  it('preserves valid logoUrl from branding', () => {
    const theme = resolveTheme(
      { logoUrl: 'https://example.com/logo.png' },
      'Branded Community',
      'condo_718',
    );
    expect(theme.logoUrl).toBe('https://example.com/logo.png');
  });

  it('rejects non-string logoUrl', () => {
    const theme = resolveTheme({ logoUrl: 42 }, 'Bad Logo', 'condo_718');
    expect(theme.logoUrl).toBeNull();
  });
});

describe('Desktop theme injection — toCssVars', () => {
  it('injects --theme-primary into style object for desktop layout wrapper', () => {
    const theme = resolveTheme({ primaryColor: '#DC2626' }, 'Red Community', 'condo_718');
    const cssVars = toCssVars(theme);
    // Simulate applying to a div style prop
    const styleObj = cssVars as React.CSSProperties;
    expect((styleObj as Record<string, string>)['--theme-primary']).toBe('#DC2626');
  });

  it('secondary and accent colors are also present in CSS vars', () => {
    const theme = resolveTheme(
      { primaryColor: '#1D4ED8', secondaryColor: '#374151', accentColor: '#BFDBFE' },
      'Full Theme',
      'condo_718',
    );
    const cssVars = toCssVars(theme);
    expect(cssVars['--theme-secondary']).toBe('#374151');
    expect(cssVars['--theme-accent']).toBe('#BFDBFE');
  });

  it('falls back to defaults when no community branding is set', () => {
    const theme = resolveTheme(null, 'Unbranded Community', 'hoa_720');
    const cssVars = toCssVars(theme);
    expect(cssVars['--theme-primary']).toBe('#2563EB');
    expect(cssVars['--theme-secondary']).toBe('#6B7280');
    expect(cssVars['--theme-accent']).toBe('#DBEAFE');
  });
});

describe('Desktop theme injection — toFontLinks', () => {
  it('returns Google Fonts stylesheet link', () => {
    const theme = resolveTheme(null, 'Test', 'condo_718');
    const links = toFontLinks(theme);
    expect(links.every((l) => l.startsWith('https://fonts.googleapis.com'))).toBe(true);
  });

  it('includes font weight variants in links', () => {
    const theme = resolveTheme(null, 'Test', 'condo_718');
    const links = toFontLinks(theme);
    // Should include multiple weights (400, 500, 600, 700)
    expect(links[0]).toContain('wght@');
  });

  it('encodes font names with + for spaces', () => {
    const theme = resolveTheme(
      { fontHeading: 'Open Sans' },
      'Space Test',
      'condo_718',
    );
    const links = toFontLinks(theme);
    expect(links.some((l) => l.includes('Open+Sans'))).toBe(true);
  });
});
