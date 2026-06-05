import { describe, it, expect } from 'vitest';
import type { CommunityBranding } from '../branding';
import {
  extractTemplateBranding,
  mergeTemplateBranding,
} from './portfolio-template-branding';

const full: CommunityBranding = {
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  fontHeading: 'Inter',
  fontBody: 'Open Sans',
  logoPath: 'communities/1/branding/logo.webp',
  siteLogoPath: 'communities/1/branding/site-logo.webp',
  customEmailFooter: 'Managed by Acme PM',
  layoutId: 'tidewater',
  themePresetSlug: 'coastal',
  tagline: 'Your home by the sea',
  assetsBytesUsed: 123456,
  customCssOverrides: { primaryColor: '#abcabc' } as CommunityBranding['customCssOverrides'],
};

describe('extractTemplateBranding', () => {
  it('keeps the captured token fields', () => {
    const t = extractTemplateBranding(full);
    expect(t).toMatchObject({
      primaryColor: '#111111',
      secondaryColor: '#222222',
      accentColor: '#333333',
      fontHeading: 'Inter',
      fontBody: 'Open Sans',
      customEmailFooter: 'Managed by Acme PM',
      layoutId: 'tidewater',
      themePresetSlug: 'coastal',
      tagline: 'Your home by the sea',
      customCssOverrides: { primaryColor: '#abcabc' },
    });
  });
  it('drops logo paths and the quota counter', () => {
    const t = extractTemplateBranding(full) as Record<string, unknown>;
    expect('logoPath' in t).toBe(false);
    expect('siteLogoPath' in t).toBe(false);
    expect('assetsBytesUsed' in t).toBe(false);
  });
  it('omits undefined fields (only copies what is set)', () => {
    const t = extractTemplateBranding({ primaryColor: '#fff' }) as Record<string, unknown>;
    expect(t).toEqual({ primaryColor: '#fff' });
  });
});

describe('mergeTemplateBranding', () => {
  it('overrides captured fields on the target but preserves target-only fields', () => {
    const target: CommunityBranding = {
      primaryColor: '#000000',
      logoPath: 'communities/9/branding/logo.webp',
      siteLogoPath: 'communities/9/branding/site-logo.webp',
      assetsBytesUsed: 999,
    };
    const template = extractTemplateBranding(full);
    const merged = mergeTemplateBranding(target, template);
    // captured token wins:
    expect(merged.primaryColor).toBe('#111111');
    expect(merged.layoutId).toBe('tidewater');
    // target-only fields preserved (logo + quota are NOT in the template):
    expect(merged.logoPath).toBe('communities/9/branding/logo.webp');
    expect(merged.siteLogoPath).toBe('communities/9/branding/site-logo.webp');
    expect(merged.assetsBytesUsed).toBe(999);
  });
});
