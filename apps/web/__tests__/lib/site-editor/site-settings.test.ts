/**
 * Website editor v3, Phase 8 — site settings + footer pure logic.
 *
 * The garbage-input block is not defensive padding. `communities.branding` is
 * untyped jsonb read through a cast, and this phase is the first code to index
 * into nested objects inside it on the public render path — which is a Florida
 * statutory entry point behind no feature flag, with no preview environment.
 * A throw here is a 500 on a real community's site.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOOTER_SETTINGS,
  DEFAULT_SITE_SETTINGS,
  FOOTER_NOTE_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  STATUTORY_FOOTER_LINE,
  isSearchIndexingEnabled,
  normalizeSettingText,
  resolveFooterSettings,
  resolveSeoDescription,
  resolveSeoTitle,
  resolveSiteSettings,
} from '@/lib/site-editor/site-settings';

const community = {
  name: 'Sunset Condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
};

describe('normalizeSettingText', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeSettingText('  Sunset   Condos \n Home  ', 60, 'Title')).toBe(
      'Sunset Condos Home',
    );
  });

  it('returns null for input that is empty after trimming', () => {
    expect(normalizeSettingText('', 60, 'Title')).toBeNull();
    expect(normalizeSettingText('   \n\t  ', 60, 'Title')).toBeNull();
  });

  it('accepts exactly the cap', () => {
    const atCap = 'a'.repeat(SEO_TITLE_MAX_LENGTH);
    expect(normalizeSettingText(atCap, SEO_TITLE_MAX_LENGTH, 'Title')).toBe(atCap);
  });

  it('rejects one past the cap', () => {
    const overCap = 'a'.repeat(SEO_TITLE_MAX_LENGTH + 1);
    expect(() => normalizeSettingText(overCap, SEO_TITLE_MAX_LENGTH, 'Title')).toThrow(
      /60 characters or fewer/,
    );
  });

  // The whole reason this counts code points. '🌀'.length === 2, so a naive
  // .length check would reject a title that reads as 60 characters to a human,
  // and the matching maxLength would freeze the field at 30 emoji.
  it('measures code points, not UTF-16 units', () => {
    const emoji = '🌀'.repeat(SEO_TITLE_MAX_LENGTH);
    expect(emoji.length).toBe(SEO_TITLE_MAX_LENGTH * 2); // guards the premise
    expect(normalizeSettingText(emoji, SEO_TITLE_MAX_LENGTH, 'Title')).toBe(emoji);

    const overByOne = '🌀'.repeat(SEO_TITLE_MAX_LENGTH + 1);
    expect(() => normalizeSettingText(overByOne, SEO_TITLE_MAX_LENGTH, 'Title')).toThrow();
  });

  it('leaves markup intact — escaping is the renderer’s job', () => {
    expect(normalizeSettingText('<script>x</script>', FOOTER_NOTE_MAX_LENGTH, 'Note')).toBe(
      '<script>x</script>',
    );
  });
});

describe('resolveSiteSettings', () => {
  it('reads a well-formed object', () => {
    expect(
      resolveSiteSettings({
        siteSettings: {
          seoTitle: 'Custom title',
          seoDescription: 'Custom description',
          searchIndexing: false,
          favicon: { icon32Path: '1/favicon/a.png', appleTouch180Path: '1/favicon/b.png' },
        },
      }),
    ).toEqual({
      seoTitle: 'Custom title',
      seoDescription: 'Custom description',
      searchIndexing: false,
      favicon: { icon32Path: '1/favicon/a.png', appleTouch180Path: '1/favicon/b.png' },
    });
  });

  it('treats blank and whitespace-only strings as unset', () => {
    const resolved = resolveSiteSettings({ siteSettings: { seoTitle: '   ', seoDescription: '' } });
    expect(resolved.seoTitle).toBeNull();
    expect(resolved.seoDescription).toBeNull();
  });

  it('drops a half-written favicon rather than emitting a broken icon link', () => {
    expect(
      resolveSiteSettings({ siteSettings: { favicon: { icon32Path: '1/favicon/a.png' } } }).favicon,
    ).toBeNull();
  });

  // Every one of these is a shape that can physically be in the column.
  it.each([
    ['null branding', null],
    ['undefined branding', undefined],
    ['string branding', 'nonsense'],
    ['number branding', 42],
    ['array branding', [1, 2, 3]],
    ['missing key', {}],
    ['siteSettings as a string', { siteSettings: 'on' }],
    ['siteSettings as a number', { siteSettings: 7 }],
    ['siteSettings as an array', { siteSettings: [] }],
    ['siteSettings null', { siteSettings: null }],
  ])('falls back to defaults and does not throw: %s', (_label, input) => {
    expect(() => resolveSiteSettings(input)).not.toThrow();
    expect(resolveSiteSettings(input)).toEqual(DEFAULT_SITE_SETTINGS);
  });

  it('ignores fields of the wrong type without discarding the good ones', () => {
    const resolved = resolveSiteSettings({
      siteSettings: { seoTitle: 123, seoDescription: 'Kept', favicon: 'nope' },
    });
    expect(resolved.seoTitle).toBeNull();
    expect(resolved.seoDescription).toBe('Kept');
    expect(resolved.favicon).toBeNull();
    expect(resolved.searchIndexing).toBe(true);
  });
});

describe('isSearchIndexingEnabled', () => {
  it('disables ONLY on an explicit boolean false', () => {
    expect(isSearchIndexingEnabled({ siteSettings: { searchIndexing: false } })).toBe(false);
  });

  // A wrong default here de-indexes every community at once, silently, and
  // costs months of recrawl to undo. Each of these must stay indexable.
  it.each([
    ['absent', {}],
    ['undefined', { siteSettings: { searchIndexing: undefined } }],
    ['null', { siteSettings: { searchIndexing: null } }],
    ['the string "false"', { siteSettings: { searchIndexing: 'false' } }],
    ['zero', { siteSettings: { searchIndexing: 0 } }],
    ['true', { siteSettings: { searchIndexing: true } }],
    ['garbage branding', 'nonsense'],
    ['null branding', null],
  ])('stays indexable when searchIndexing is %s', (_label, input) => {
    expect(isSearchIndexingEnabled(input)).toBe(true);
  });
});

describe('resolveFooterSettings', () => {
  it('reads a well-formed object', () => {
    expect(
      resolveFooterSettings({
        siteFooter: {
          associationName: 'Sunset Condominium Association, Inc.',
          note: 'Managed by Acme.',
          showStatutoryLine: true,
        },
      }),
    ).toEqual({
      associationName: 'Sunset Condominium Association, Inc.',
      note: 'Managed by Acme.',
      showStatutoryLine: true,
    });
  });

  // Compliance constraint, gap analysis §5 — the statutory line is opt-in.
  it.each([
    ['absent', {}],
    ['undefined', { siteFooter: { showStatutoryLine: undefined } }],
    ['null', { siteFooter: { showStatutoryLine: null } }],
    ['the string "true"', { siteFooter: { showStatutoryLine: 'true' } }],
    ['one', { siteFooter: { showStatutoryLine: 1 } }],
    ['garbage branding', 12345],
  ])('leaves the statutory line OFF when showStatutoryLine is %s', (_label, input) => {
    expect(resolveFooterSettings(input).showStatutoryLine).toBe(false);
  });

  it.each([
    ['null branding', null],
    ['string branding', 'nonsense'],
    ['siteFooter as a string', { siteFooter: 'yes' }],
    ['siteFooter as an array', { siteFooter: [] }],
  ])('falls back to defaults and does not throw: %s', (_label, input) => {
    expect(() => resolveFooterSettings(input)).not.toThrow();
    expect(resolveFooterSettings(input)).toEqual(DEFAULT_FOOTER_SETTINGS);
  });
});

describe('resolveSeoTitle / resolveSeoDescription', () => {
  it('prefers the PM override', () => {
    const settings = { ...DEFAULT_SITE_SETTINGS, seoTitle: 'Our Home', seoDescription: 'Ours.' };
    expect(resolveSeoTitle(settings, community)).toBe('Our Home');
    expect(resolveSeoDescription(settings, community, 'a tagline')).toBe('Ours.');
  });

  it('falls back to the derived title', () => {
    expect(resolveSeoTitle(DEFAULT_SITE_SETTINGS, community)).toBe(
      'Sunset Condos — Community Portal',
    );
  });

  it('falls back to the tagline, then to the derived description', () => {
    expect(resolveSeoDescription(DEFAULT_SITE_SETTINGS, community, 'A welcoming place.')).toBe(
      'A welcoming place.',
    );
    expect(resolveSeoDescription(DEFAULT_SITE_SETTINGS, community, '   ')).toBe(
      'Official site of Sunset Condos, a condominium association in Miami, Florida.',
    );
    expect(resolveSeoDescription(DEFAULT_SITE_SETTINGS, community, null)).toBe(
      'Official site of Sunset Condos, a condominium association in Miami, Florida.',
    );
  });

  it('omits the city when there is none', () => {
    expect(
      resolveSeoDescription(DEFAULT_SITE_SETTINGS, { ...community, city: null }, null),
    ).toBe('Official site of Sunset Condos, a condominium association in Florida.');
  });

  it('names the right noun per community type', () => {
    expect(resolveSeoDescription(DEFAULT_SITE_SETTINGS, { ...community, communityType: 'hoa_720' }, null))
      .toContain('a homeowners association');
    expect(resolveSeoDescription(DEFAULT_SITE_SETTINGS, { ...community, communityType: 'apartment' }, null))
      .toContain('an apartment community');
  });
});

describe('STATUTORY_FOOTER_LINE', () => {
  // Pinned. The wording is a compliance decision (gap analysis §5), not copy
  // that a later edit may tidy: "records maintained under" is a statement the
  // association makes about itself, and anything closer to "complies with"
  // reads as PropertyPro certifying the association's statutory compliance.
  it('is the exact opt-in records line', () => {
    expect(STATUTORY_FOOTER_LINE).toBe(
      'Records maintained under Fla. Stat. §718.111(12)(g)',
    );
  });
});
