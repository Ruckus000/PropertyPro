import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_DEFAULTS } from '../src';

describe('resolveTheme', () => {
  it('returns a complete theme for fully valid branding input', () => {
    const theme = resolveTheme(
      {
        primaryColor: '#0F172A',
        secondaryColor: '#334155',
        accentColor: '#E2E8F0',
        fontHeading: 'Montserrat',
        fontBody: 'Lato',
        logoUrl: 'https://example.com/logo.png',
      },
      'Palm Shores HOA',
      'hoa_720',
    );

    expect(theme).toEqual({
      primaryColor: '#0F172A',
      secondaryColor: '#334155',
      accentColor: '#E2E8F0',
      fontHeading: 'Montserrat',
      fontBody: 'Lato',
      logoUrl: 'https://example.com/logo.png',
      communityName: 'Palm Shores HOA',
      communityType: 'hoa_720',
    });
  });

  it('returns defaults when branding is null', () => {
    const theme = resolveTheme(null, 'Sunset Condos', 'condo_718');

    expect(theme).toEqual({
      ...THEME_DEFAULTS,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
    });
  });

  it('falls back to default color when color format is invalid', () => {
    const theme = resolveTheme(
      {
        primaryColor: 'not-a-color',
        secondaryColor: '#6B7280',
        accentColor: '#DBEAFE',
        fontHeading: 'Inter',
        fontBody: 'Inter',
      },
      'Sunset Condos',
      'condo_718',
    );

    expect(theme.primaryColor).toBe(THEME_DEFAULTS.primaryColor);
  });

  it('falls back to Inter when font is not allowed', () => {
    const theme = resolveTheme(
      {
        primaryColor: '#2563EB',
        secondaryColor: '#6B7280',
        accentColor: '#DBEAFE',
        fontHeading: 'Comic Sans',
        fontBody: 'Papyrus',
      },
      'Sunset Ridge Apartments',
      'apartment',
    );

    expect(theme.fontHeading).toBe('Inter');
    expect(theme.fontBody).toBe('Inter');
  });
});
