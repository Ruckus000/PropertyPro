import { describe, expect, it } from 'vitest';
import { effectiveLook, liveLook, pendingLook, type CommunityBranding } from '../branding';

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
