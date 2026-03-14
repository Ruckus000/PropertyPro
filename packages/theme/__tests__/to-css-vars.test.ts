import { describe, expect, it } from 'vitest';
import { toCssVars } from '../src';

describe('toCssVars', () => {
  it('maps theme fields to CSS variables and converts null logoUrl to none', () => {
    const cssVars = toCssVars({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Inter',
      fontBody: 'Lato',
      logoUrl: null,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
    });

    expect(cssVars).toEqual({
      '--theme-primary': '#2563EB',
      '--theme-primary-hover': '#1f54c8',
      '--theme-secondary': '#6B7280',
      '--theme-accent': '#DBEAFE',
      '--theme-font-heading': 'Inter',
      '--theme-font-body': 'Lato',
      '--theme-logo-url': 'none',
      '--theme-community-name': 'Sunset Condos',
    });
  });
});
