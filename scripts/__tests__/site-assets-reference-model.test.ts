import { describe, it, expect } from 'vitest';
import {
  expandToStoredObjects,
  referencedBasePaths,
  referencedBrandingPaths,
} from '../lib/site-assets-reference-model';

/**
 * The reference model is the part of the reconciler that has to be complete.
 *
 * Every asset it fails to recognise becomes a reported orphan — and the orphan
 * list is the input to a future decision about deleting bytes from production.
 * A gap here does not degrade the report, it actively argues for deleting a
 * live asset. So each path-bearing shape gets its own assertion.
 */
describe('referencedBasePaths', () => {
  it('finds an image block path', () => {
    expect(referencedBasePaths('image', { imagePath: '1/content/a.jpg', altText: 'A' })).toEqual([
      '1/content/a.jpg',
    ]);
  });

  it('finds every gallery image, not just the first', () => {
    expect(
      referencedBasePaths('gallery', {
        images: [
          { imagePath: '1/content/a.jpg', altText: 'A' },
          { imagePath: '1/content/b.jpg', decorative: true },
          { imagePath: '1/content/c.jpg', altText: 'C' },
        ],
      }),
    ).toEqual(['1/content/a.jpg', '1/content/b.jpg', '1/content/c.jpg']);
  });

  it('finds both hero shapes — the photos array and the legacy single image', () => {
    // heroBlockSchema keeps heroImagePath for rows written before photos[]
    // existed. Missing it would orphan every un-migrated community's hero.
    expect(
      referencedBasePaths('hero', {
        headline: 'Hi',
        heroImagePath: '1/hero/legacy.jpg',
      }),
    ).toEqual(['1/hero/legacy.jpg']);

    expect(
      referencedBasePaths('hero', {
        headline: 'Hi',
        photos: [
          { path: '1/hero/one.jpg', alt: 'One' },
          { path: '1/hero/two.jpg', decorative: true },
        ],
      }),
    ).toEqual(['1/hero/one.jpg', '1/hero/two.jpg']);
  });

  it('returns nothing for block types that carry no assets', () => {
    expect(referencedBasePaths('text', { body: 'hello' })).toEqual([]);
    expect(referencedBasePaths('payments', { ctaTarget: 'https://x.test/pay' })).toEqual([]);
  });

  it('survives malformed content rather than throwing', () => {
    // This walks production rows. A row that fails its schema must not crash a
    // maintenance script — it should simply contribute no references.
    expect(referencedBasePaths('image', null)).toEqual([]);
    expect(referencedBasePaths('image', 'nonsense')).toEqual([]);
    expect(referencedBasePaths('gallery', { images: 'not-an-array' })).toEqual([]);
    expect(referencedBasePaths('gallery', { images: [null, 42, { imagePath: '1/c/x.jpg' }] })).toEqual(
      ['1/c/x.jpg'],
    );
    expect(referencedBasePaths('hero', { photos: [{ path: 123 }] })).toEqual([]);
  });
});

describe('expandToStoredObjects', () => {
  it('maps a base path to the two variants finalize actually wrote', () => {
    // finalize deletes the raw upload at the base path, so the base path is
    // never itself an object. Comparing base paths against the bucket would
    // report every real asset as an orphan AND every real object as
    // unreferenced — the exact bug this expansion exists to prevent.
    expect([...expandToStoredObjects(['1/hero/a.jpg'])]).toEqual([
      '1/hero/a.jpg.1600w.webp',
      '1/hero/a.jpg.800w.webp',
    ]);
  });

  it('does not include the base path itself', () => {
    expect(expandToStoredObjects(['1/hero/a.jpg']).has('1/hero/a.jpg')).toBe(false);
  });

  it('deduplicates paths referenced by more than one row', () => {
    // A draft and a published row commonly point at the same object; that is
    // precisely why decrement-on-remove is wrong and this reconciler exists.
    const stored = expandToStoredObjects(['1/hero/a.jpg', '1/hero/a.jpg']);
    expect(stored.size).toBe(2);
  });
});

describe('referencedBrandingPaths', () => {
  it('finds both processed favicon variants, used verbatim', () => {
    expect(
      referencedBrandingPaths({
        favicon: { icon32Path: '1/favicon/i.png', appleTouch180Path: '1/favicon/a.png' },
      }),
    ).toEqual(['1/favicon/i.png', '1/favicon/a.png']);
  });

  it('returns nothing when there is no favicon', () => {
    expect(referencedBrandingPaths({})).toEqual([]);
    expect(referencedBrandingPaths({ favicon: null })).toEqual([]);
    expect(referencedBrandingPaths(null)).toEqual([]);
  });

  it('ignores logoPath and siteLogoPath, which live in the documents bucket', () => {
    // Counting them here would look harmless but would silently widen the
    // reference set with paths that can never appear in this bucket.
    expect(
      referencedBrandingPaths({ logoPath: 'x/logo.png', siteLogoPath: 'x/site.png' }),
    ).toEqual([]);
  });
});
