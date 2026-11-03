import { describe, expect, it } from 'vitest';
import { toCssVars } from '../src';

describe('toCssVars', () => {
  it('maps theme fields to CSS variables, quoting font families', () => {
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
      '--theme-font-heading': '"Inter"',
      '--theme-font-body': '"Lato"',
    });
  });

  // "Source Sans 3" unquoted is not a valid family (`3` is not an identifier), so the
  // whole font-family declaration reading it was dropped and the text inherited Inter.
  it('quotes a family whose name contains a digit, so it is valid CSS', () => {
    const cssVars = toCssVars({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Source Serif 4',
      fontBody: 'Source Sans 3',
      logoUrl: null,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
    });
    expect(cssVars['--theme-font-body']).toBe('"Source Sans 3"');
    expect(cssVars['--theme-font-heading']).toBe('"Source Serif 4"');
  });

  it('never writes free-text theme fields into CSS', () => {
    const cssVars = toCssVars({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      logoUrl: 'https://cdn.example/logo.png',
      communityName: 'Bay; color: red',
      communityType: 'condo_718',
    });
    expect(Object.values(cssVars).join(' ')).not.toMatch(/Bay|logo\.png/);
  });
});
