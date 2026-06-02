import { describe, expect, it } from 'vitest';
import { customCssOverridesToCssVars } from '../src';

describe('customCssOverridesToCssVars', () => {
  it('returns {} for null / undefined / non-object input', () => {
    expect(customCssOverridesToCssVars(null)).toEqual({});
    expect(customCssOverridesToCssVars(undefined)).toEqual({});
    expect(customCssOverridesToCssVars('nope')).toEqual({});
    expect(customCssOverridesToCssVars(42)).toEqual({});
    expect(customCssOverridesToCssVars({})).toEqual({});
  });

  it('maps primaryColor to --theme-primary plus a darkened hover', () => {
    expect(customCssOverridesToCssVars({ primaryColor: '#2563EB' })).toEqual({
      '--theme-primary': '#2563EB',
      '--theme-primary-hover': '#1f54c8',
    });
  });

  it('maps secondaryColor and accentColor', () => {
    expect(customCssOverridesToCssVars({ secondaryColor: '#6B7280', accentColor: '#DBEAFE' })).toEqual({
      '--theme-secondary': '#6B7280',
      '--theme-accent': '#DBEAFE',
    });
  });

  it('maps an allowlisted bodyFont to --theme-font-body', () => {
    expect(customCssOverridesToCssVars({ bodyFont: 'Lato' })).toEqual({
      '--theme-font-body': 'Lato',
    });
  });

  it('maps a full override set (colors + font)', () => {
    expect(
      customCssOverridesToCssVars({
        primaryColor: '#112233',
        secondaryColor: '#445566',
        accentColor: '#778899',
        bodyFont: 'Merriweather',
      }),
    ).toEqual({
      '--theme-primary': '#112233',
      '--theme-primary-hover': darkExpected('#112233'),
      '--theme-secondary': '#445566',
      '--theme-accent': '#778899',
      '--theme-font-body': 'Merriweather',
    });
  });

  it('skips invalid hex colors (3-digit, named, malformed)', () => {
    expect(customCssOverridesToCssVars({ primaryColor: '#fff' })).toEqual({});
    expect(customCssOverridesToCssVars({ secondaryColor: 'red' })).toEqual({});
    expect(customCssOverridesToCssVars({ accentColor: '#12345' })).toEqual({});
    expect(customCssOverridesToCssVars({ primaryColor: 'javascript:alert(1)' })).toEqual({});
  });

  it('skips a bodyFont that is not on the allowlist', () => {
    expect(customCssOverridesToCssVars({ bodyFont: 'Comic Sans MS' })).toEqual({});
    expect(customCssOverridesToCssVars({ bodyFont: '' })).toEqual({});
  });

  it('applies only the valid fields when some are invalid', () => {
    expect(
      customCssOverridesToCssVars({ primaryColor: '#2563EB', accentColor: 'not-a-color', bodyFont: 'Comic Sans' }),
    ).toEqual({
      '--theme-primary': '#2563EB',
      '--theme-primary-hover': '#1f54c8',
    });
  });
});

// Mirror of the production darkenHex(_, 15) so the test stays independent of
// the exact arithmetic while pinning the contract.
function darkExpected(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const f = 1 - 15 / 100;
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * f));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * f));
  const b = Math.max(0, Math.round((num & 0xff) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
