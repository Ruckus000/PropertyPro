import { describe, expect, it } from 'vitest';
import { canvasThemeVars } from '@/lib/site-editor/canvas-theme';

const CONTEXT = {
  community: {
    id: 1,
    slug: 's',
    name: 'Sunset',
    shortName: null,
    logoUrl: 'https://cdn/logo.webp',
    communityType: 'condo_718' as const,
    city: null,
    state: null,
    unitCount: null,
    timezone: 'America/New_York',
  },
  theme: {
    primaryColor: '#0E3338',
    secondaryColor: '#F6F1E6',
    accentColor: '#C66F49',
    headingFont: 'Fraunces',
    bodyFont: 'Inter',
  },
};

describe('canvasThemeVars', () => {
  it('turns the canvas theme into the custom properties the public-site classes read', () => {
    const { cssVars } = canvasThemeVars(CONTEXT);
    const vars = cssVars as Record<string, string>;
    expect(vars['--theme-primary']).toBe('#0E3338');
    expect(vars['--theme-secondary']).toBe('#F6F1E6');
    expect(vars['--theme-accent']).toBe('#C66F49');
    expect(vars['--theme-font-heading']).toBe('Fraunces');
    expect(vars['--theme-font-body']).toBe('Inter');
    expect(vars['--theme-logo-url']).toBe('https://cdn/logo.webp');
  });

  it('re-declares the semantic aliases beside the theme, so bg-primary repaints too', () => {
    const vars = canvasThemeVars(CONTEXT).cssVars as Record<string, string>;
    expect(vars['--interactive-primary']).toBe('var(--theme-primary)');
    expect(vars['--brand-accent']).toBe('var(--theme-accent)');
  });

  it('changes with the context, so a template or colour-set change repaints', () => {
    const before = canvasThemeVars(CONTEXT).cssVars as Record<string, string>;
    const after = canvasThemeVars({
      ...CONTEXT,
      theme: { ...CONTEXT.theme, primaryColor: '#AA0000' },
    }).cssVars as Record<string, string>;
    expect(before['--theme-primary']).not.toBe(after['--theme-primary']);
    expect(after['--theme-primary']).toBe('#AA0000');
  });

  it('loads the chosen web fonts and skips the self-hosted one', () => {
    const { fontLinks } = canvasThemeVars(CONTEXT);
    expect(fontLinks).toHaveLength(1);
    expect(fontLinks[0]).toContain('family=Fraunces');
    expect(fontLinks.some((href) => href.includes('Inter'))).toBe(false);
  });
});
