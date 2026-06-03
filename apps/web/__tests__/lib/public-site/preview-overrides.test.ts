import { describe, it, expect } from 'vitest';
import {
  resolvePreviewLayoutId,
  applyPresetTokensToBranding,
} from '@/lib/public-site/preview-overrides';

describe('resolvePreviewLayoutId', () => {
  it('uses a valid layout override', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'tidewater' }, 'sable', 'condo_718')).toBe('sable');
  });

  it('falls back to the saved branding layout when override is invalid/absent', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, null, 'condo_718')).toBe('boulevard');
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, 'not-a-layout', 'condo_718')).toBe('boulevard');
  });

  it('falls back to the community-type default when nothing is set', () => {
    expect(resolvePreviewLayoutId(null, null, 'apartment')).toBe('sable');
    expect(resolvePreviewLayoutId(null, undefined, 'condo_718')).toBe('tidewater');
  });
});

describe('applyPresetTokensToBranding', () => {
  it('returns branding unchanged when there are no preset tokens', () => {
    const branding = { primaryColor: '#111111', fontHeading: 'Fraunces' };
    expect(applyPresetTokensToBranding(branding, null)).toBe(branding);
  });

  it('layers preset color + font tokens over branding (preset wins; font names mapped)', () => {
    const branding = { primaryColor: '#111111', secondaryColor: '#222222', fontHeading: 'Fraunces', fontBody: 'Manrope' };
    const result = applyPresetTokensToBranding(branding, {
      primaryColor: '#0e3338',
      accentColor: '#c66f49',
      headingFont: 'Newsreader',
      bodyFont: 'Inter',
    });
    expect(result).toMatchObject({
      primaryColor: '#0e3338', // preset wins
      secondaryColor: '#222222', // untouched (preset didn't set it)
      accentColor: '#c66f49',
      fontHeading: 'Newsreader', // headingFont → fontHeading
      fontBody: 'Inter', // bodyFont → fontBody
    });
  });

  it('works when branding is null (preset-only)', () => {
    const result = applyPresetTokensToBranding(null, { primaryColor: '#abcabc', bodyFont: 'Inter' });
    expect(result).toEqual({ primaryColor: '#abcabc', fontBody: 'Inter' });
  });
});
