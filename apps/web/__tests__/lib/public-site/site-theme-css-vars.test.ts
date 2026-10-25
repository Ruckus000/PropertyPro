import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_THEME_ALIASES, siteThemeCssVars } from '@/lib/public-site/site-theme-css-vars';

const THEME = {
  primaryColor: '#0E3338',
  secondaryColor: '#F6F1E6',
  accentColor: '#C66F49',
  fontHeading: 'Fraunces',
  fontBody: 'Manrope',
  logoUrl: null,
  communityName: 'Sunset Condos',
  communityType: 'condo_718' as const,
};

describe('siteThemeCssVars', () => {
  it('carries the theme values and the Pro overrides on top', () => {
    const vars = siteThemeCssVars(THEME, { primaryColor: '#112233' });
    expect(vars['--theme-primary']).toBe('#112233');
    expect(vars['--theme-accent']).toBe('#C66F49');
    expect(vars['--theme-font-heading']).toBe('Fraunces');
  });

  it('re-declares the semantic aliases as references, so bg-primary follows the theme', () => {
    // A `bg-primary` element reads `--interactive-primary`, which tokens.css
    // resolves at :root. Re-declared beside the theme values it resolves to
    // THEM — that is the whole reason the hero was coral on every community.
    const vars = siteThemeCssVars(THEME);
    expect(vars['--interactive-primary']).toBe('var(--theme-primary)');
    expect(vars['--interactive-primary-hover']).toBe('var(--theme-primary-hover)');
    expect(vars['--brand-accent']).toBe('var(--theme-accent)');
    expect(vars['--status-brand']).toBe('var(--theme-primary)');
  });

  it('aliases exactly the tokens tokens.css defines in terms of --theme-*', () => {
    // Read from the generated stylesheet so a new theme-following token in
    // packages/tokens cannot be forgotten here silently.
    const css = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'packages', 'ui', 'src', 'styles', 'tokens.css'),
      'utf8',
    );
    const declared = [...css.matchAll(/^\s*(--[\w-]+):\s*var\((--theme-[\w-]+)/gm)].map(
      (m) => [m[1]!, `var(${m[2]!})`] as const,
    );
    expect(declared.length).toBeGreaterThan(0); // anti-vacuity: the regex saw the block
    expect(Object.fromEntries(declared)).toEqual(SITE_THEME_ALIASES);
  });
});
