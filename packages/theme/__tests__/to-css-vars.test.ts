import { describe, it, expect } from 'vitest';
import { toCssVars } from '../src/to-css-vars';
import type { CommunityTheme } from '../src/types';

const theme: CommunityTheme = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Lato',
  logoUrl: 'https://example.com/logo.webp',
  communityName: 'Sunset Condos',
  communityType: 'condo_718',
};

describe('toCssVars', () => {
  it('returns correct CSS custom property key-value pairs', () => {
    const vars = toCssVars(theme);

    expect(vars['--theme-primary']).toBe('#2563EB');
    expect(vars['--theme-secondary']).toBe('#6B7280');
    expect(vars['--theme-accent']).toBe('#DBEAFE');
    expect(vars['--theme-font-heading']).toBe('Inter');
    expect(vars['--theme-font-body']).toBe('Lato');
    expect(vars['--theme-logo-url']).toBe('https://example.com/logo.webp');
    expect(vars['--theme-community-name']).toBe('Sunset Condos');
  });

  it('omits null logoUrl', () => {
    const vars = toCssVars({ ...theme, logoUrl: null });

    expect('--theme-logo-url' in vars).toBe(false);
  });

  it('does not include communityType as a CSS var', () => {
    const vars = toCssVars(theme);

    expect('--theme-community-type' in vars).toBe(false);
    // Ensure exactly the expected keys are present
    const keys = Object.keys(vars);
    expect(keys).not.toContain('communityType');
  });
});
