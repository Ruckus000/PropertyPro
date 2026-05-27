import { describe, it, expect } from 'vitest';
import { buildCommunityMetadata } from '@/lib/seo/community-metadata';

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

  it('builds the canonical site url from the slug', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.openGraph?.url).toBe('https://sunset-condos.getpropertypro.com');
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
    expect(withImage.twitter?.card).toBe('summary_large_image');

    const noImage = buildCommunityMetadata(baseCommunity);
    expect(noImage.twitter?.card).toBe('summary');
  });

  it('falls back gracefully when city is null', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, city: null });
    expect(meta.description).toContain('Florida');
    expect(meta.description).not.toContain('null');
  });
});
