import { describe, it, expect } from 'vitest';
import type { Metadata } from 'next';
import { buildCommunityMetadata } from '@/lib/seo/community-metadata';
import {
  DEFAULT_SITE_SETTINGS,
  resolveSiteSettings,
  type SiteSettings,
} from '@/lib/site-editor/site-settings';

// `Metadata['twitter']` is a union whose bare `TwitterMetadata` member carries no
// `card`, so the property has to be reached through an `in` narrow. Same result
// as `meta.twitter?.card`: undefined when twitter is absent or card-less.
function twitterCard(twitter: Metadata['twitter']): string | undefined {
  return twitter && 'card' in twitter ? twitter.card : undefined;
}

const baseCommunity = {
  id: 1,
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
};

describe('buildCommunityMetadata', () => {
  it('produces a title with " — Community Portal" suffix', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.title).toBe('Sunset Condos — Community Portal');
  });

  it('uses the tagline as description when provided', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, tagline: 'A welcoming Florida community.' });
    expect(meta.description).toBe('A welcoming Florida community.');
  });

  it('falls back to a community-type-aware default description when no tagline', () => {
    const condo = buildCommunityMetadata(baseCommunity);
    expect(condo.description).toContain('condominium association');
    expect(condo.description).toContain('Miami');

    const hoa = buildCommunityMetadata({ ...baseCommunity, communityType: 'hoa_720' });
    expect(hoa.description).toContain('homeowners association');

    const apt = buildCommunityMetadata({ ...baseCommunity, communityType: 'apartment' });
    expect(apt.description).toContain('apartment community');
  });

  it('falls back to default description when tagline is the empty string', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, tagline: '' });
    expect(meta.description).toContain('condominium association');
  });

  it('falls back to default description when tagline is whitespace-only', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, tagline: '   ' });
    expect(meta.description).toContain('condominium association');
  });

  it('builds the canonical site url from the slug via buildCommunityUrl', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.openGraph?.url).toBe('https://sunset-condos.getpropertypro.com/');
  });

  it('sets robots index:true follow:true (the public site is meant to be crawled)', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it('produces no openGraph image when no heroImageUrl is provided', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.openGraph?.images ?? []).toEqual([]);
  });

  it('emits a 1600x900 openGraph image when heroImageUrl is provided', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      heroImageUrl: 'https://cdn.example.com/hero.webp',
    });
    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/hero.webp', width: 1600, height: 900, alt: 'Sunset Condos' },
    ]);
  });

  it('uses summary_large_image when there is a heroImageUrl, summary otherwise', () => {
    const withImage = buildCommunityMetadata({ ...baseCommunity, heroImageUrl: 'https://x/y.webp' });
    expect(twitterCard(withImage.twitter)).toBe('summary_large_image');

    const noImage = buildCommunityMetadata(baseCommunity);
    expect(twitterCard(noImage.twitter)).toBe('summary');
  });

  it('falls back gracefully when city is null', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, city: null });
    expect(meta.description).toContain('Florida');
    expect(meta.description).not.toContain('null');
  });

  it('says "an apartment community", not "a apartment community"', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, communityType: 'apartment' });
    expect(meta.description).toContain('an apartment community');
  });
});

/**
 * Website editor v3, Phase 8 — the PM's overrides.
 *
 * `robots` is the one the phase names explicitly: the requirement is that the
 * indexing flag reaches the rendered output, not merely that it is stored.
 */
describe('buildCommunityMetadata — Phase 8 site settings', () => {
  const settings = (over: Partial<SiteSettings> = {}): SiteSettings => ({
    ...DEFAULT_SITE_SETTINGS,
    ...over,
  });

  it('uses the PM title and description over the derived ones', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      tagline: 'ignored when an override exists',
      siteSettings: settings({ seoTitle: 'Sunset Living', seoDescription: 'Our home.' }),
    });
    expect(meta.title).toBe('Sunset Living');
    expect(meta.description).toBe('Our home.');
    expect(meta.openGraph?.title).toBe('Sunset Living');
    expect(meta.twitter?.title).toBe('Sunset Living');
  });

  it('falls back through tagline to derived when the overrides are unset', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      tagline: 'A welcoming Florida community.',
      siteSettings: settings(),
    });
    expect(meta.title).toBe('Sunset Condos — Community Portal');
    expect(meta.description).toBe('A welcoming Florida community.');
  });

  it('turns robots off when the PM opts out', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      siteSettings: settings({ searchIndexing: false }),
    });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('stays indexable when the flag is on, and when settings are absent entirely', () => {
    expect(
      buildCommunityMetadata({ ...baseCommunity, siteSettings: settings({ searchIndexing: true }) })
        .robots,
    ).toMatchObject({ index: true, follow: true });

    // The default path — a community that has never touched the setting.
    expect(buildCommunityMetadata(baseCommunity).robots).toMatchObject({
      index: true,
      follow: true,
    });
  });

  /**
   * The malformed-branding path, end to end.
   *
   * `generateMetadata` feeds `resolveSiteSettings(branding)` straight in, and
   * the public site is behind no feature flag with no preview environment — a
   * throw here is a 500 on a real community's statutory page. The intended
   * end-to-end assertion would live in `site-page.test.tsx`, but that file is
   * one of the three suites already failing on a missing DATABASE_URL, so the
   * two halves are pinned separately: the resolver never throws
   * (`site-settings.test.ts`) and its output always builds valid metadata here.
   */
  it.each([
    ['null', null],
    ['a string', 'nonsense'],
    ['a number', 42],
    ['an array', []],
    ['a non-object siteSettings', { siteSettings: 'on' }],
    ['wrong-typed fields', { siteSettings: { seoTitle: 123, favicon: 'nope' } }],
  ])('builds default metadata from malformed branding: %s', (_label, branding) => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      siteSettings: resolveSiteSettings(branding),
    });
    expect(meta.title).toBe('Sunset Condos — Community Portal');
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    expect(meta.icons).toBeUndefined();
  });

  it('emits no icons when no favicon is set', () => {
    expect(buildCommunityMetadata(baseCommunity).icons).toBeUndefined();
  });

  it('emits 32×32 and 180×180 icon links from the stored paths', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      siteSettings: settings({
        favicon: { icon32Path: '1/favicon/a.png', appleTouch180Path: '1/favicon/b.png' },
      }),
    });

    const icons = meta.icons as { icon: { url: string; sizes: string }[]; apple: { sizes: string }[] };
    expect(icons.icon[0]?.sizes).toBe('32x32');
    expect(icons.icon[0]?.url).toContain('1/favicon/a.png');
    expect(icons.apple[0]?.sizes).toBe('180x180');
  });
});
