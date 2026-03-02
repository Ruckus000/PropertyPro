import { describe, it, expect } from 'vitest';
import { resolveTheme } from '../src/resolve-theme';
import { THEME_DEFAULTS } from '../src/constants';

describe('resolveTheme', () => {
  it('returns correct CommunityTheme from valid branding', () => {
    const branding = {
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      accentColor: '#0000FF',
      fontHeading: 'Poppins',
      fontBody: 'Lato',
    };

    const theme = resolveTheme(branding, 'Sunset Condos', 'condo_718', { logoUrl: null });

    expect(theme.primaryColor).toBe('#FF0000');
    expect(theme.secondaryColor).toBe('#00FF00');
    expect(theme.accentColor).toBe('#0000FF');
    expect(theme.fontHeading).toBe('Poppins');
    expect(theme.fontBody).toBe('Lato');
    expect(theme.communityName).toBe('Sunset Condos');
    expect(theme.communityType).toBe('condo_718');
    expect(theme.logoUrl).toBeNull();
  });

  it('uses all defaults when branding is null', () => {
    const theme = resolveTheme(null, 'My Community', 'hoa_720');

    expect(theme.primaryColor).toBe(THEME_DEFAULTS.primaryColor);
    expect(theme.secondaryColor).toBe(THEME_DEFAULTS.secondaryColor);
    expect(theme.accentColor).toBe(THEME_DEFAULTS.accentColor);
    expect(theme.fontHeading).toBe(THEME_DEFAULTS.fontHeading);
    expect(theme.fontBody).toBe(THEME_DEFAULTS.fontBody);
    expect(theme.logoUrl).toBeNull();
    expect(theme.communityType).toBe('hoa_720');
  });

  it('uses all defaults when branding is empty object', () => {
    const theme = resolveTheme({}, 'My Community', 'apartment');

    expect(theme.primaryColor).toBe(THEME_DEFAULTS.primaryColor);
    expect(theme.fontHeading).toBe(THEME_DEFAULTS.fontHeading);
  });

  it('falls back to Inter for invalid font', () => {
    const theme = resolveTheme(
      { fontHeading: 'Comic Sans MS', fontBody: 'Wingdings' },
      'Test',
      'condo_718',
    );

    expect(theme.fontHeading).toBe('Inter');
    expect(theme.fontBody).toBe('Inter');
  });

  it('falls back to default primary for invalid hex color', () => {
    const theme = resolveTheme(
      { primaryColor: 'not-a-hex', secondaryColor: '#GGGGGG' },
      'Test',
      'condo_718',
    );

    expect(theme.primaryColor).toBe(THEME_DEFAULTS.primaryColor);
    expect(theme.secondaryColor).toBe(THEME_DEFAULTS.secondaryColor);
  });

  it('applies logoUrl override', () => {
    const theme = resolveTheme({}, 'Test', 'condo_718', {
      logoUrl: 'https://example.com/logo.webp',
    });

    expect(theme.logoUrl).toBe('https://example.com/logo.webp');
  });

  it('defaults communityType to condo_718 for unknown type', () => {
    const theme = resolveTheme({}, 'Test', 'unknown_type_xyz');

    expect(theme.communityType).toBe('condo_718');
  });
});
