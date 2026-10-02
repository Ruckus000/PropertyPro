import { describe, expect, it } from 'vitest';
import {
  effectiveLook,
  liveLook,
  liveLookKeysToStrip,
  pendingLook,
  type CommunityBranding,
} from '../branding';

const LIVE: CommunityBranding = {
  primaryColor: '#111111',
  layoutId: 'tidewater',
  logoPath: 'logos/a.webp',
};

describe('effectiveLook', () => {
  const branding: CommunityBranding = {
    ...LIVE,
    draftLook: { primaryColor: '#222222', layoutId: 'boulevard' },
  };

  it('shows the draft look to a preview', () => {
    expect(effectiveLook(branding, { includeDraft: true })).toEqual({
      primaryColor: '#222222',
      layoutId: 'boulevard',
      logoPath: 'logos/a.webp',
    });
  });

  it('shows live pages the published look, without the draft key', () => {
    expect(effectiveLook(branding, { includeDraft: false })).toEqual(LIVE);
  });
});

describe('pendingLook', () => {
  it('lists only the draft fields that differ from live', () => {
    expect(
      pendingLook({ ...LIVE, draftLook: { primaryColor: '#111111', accentColor: '#333333' } }),
    ).toEqual({ accentColor: '#333333' });
  });

  it('is empty without a draft', () => {
    expect(pendingLook(LIVE)).toEqual({});
  });

  it('counts clearing custom colours as a change', () => {
    expect(
      pendingLook({ customCssOverrides: { primaryColor: '#123456' }, draftLook: { customCssOverrides: null } }),
    ).toEqual({ customCssOverrides: null });
  });
});

describe('liveLook', () => {
  it('keeps only the look fields', () => {
    expect(liveLook(LIVE)).toEqual({ primaryColor: '#111111', layoutId: 'tidewater' });
  });
});

describe('liveLookKeysToStrip', () => {
  it('strips nothing for a write with no look fields (logos, tagline, footer)', () => {
    expect(
      liveLookKeysToStrip({ siteLogoPath: 'x.webp', tagline: 'Hi', customEmailFooter: '' }),
    ).toEqual([]);
  });

  it('strips a written colour AND the drafted colour-set slug that described it', () => {
    expect(liveLookKeysToStrip({ primaryColor: '#112233' })).toEqual([
      'themePresetSlug',
      'primaryColor',
    ]);
  });

  it('strips the slug for a font write too: fonts are part of a colour set', () => {
    expect(liveLookKeysToStrip({ fontBody: 'Lato' })).toEqual(['themePresetSlug', 'fontBody']);
  });

  it('leaves the slug alone for a layout-only write', () => {
    expect(liveLookKeysToStrip({ layoutId: 'tidewater' })).toEqual(['layoutId']);
  });

  it('strips customCssOverrides as a whole key, including a null that clears it', () => {
    expect(liveLookKeysToStrip({ customCssOverrides: null })).toEqual(['customCssOverrides']);
  });

  it('ignores undefined values: they are not writes', () => {
    expect(liveLookKeysToStrip({ primaryColor: undefined, layoutId: 'sable' })).toEqual([
      'layoutId',
    ]);
  });

  it('covers a full template in SITE_LOOK_FIELDS order', () => {
    expect(
      liveLookKeysToStrip({
        tagline: 'Welcome',
        customCssOverrides: { primaryColor: '#000000' },
        fontHeading: 'Lato',
        layoutId: 'boulevard',
        themePresetSlug: 'coastal',
      }),
    ).toEqual(['layoutId', 'themePresetSlug', 'fontHeading', 'customCssOverrides']);
  });
});
