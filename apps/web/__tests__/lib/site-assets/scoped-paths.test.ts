import { describe, it, expect } from 'vitest';
import { blockSchemaRegistry } from '@propertypro/shared';
import {
  assertPathsScopedToCommunity,
  collectBlockAssetPaths,
} from '@/lib/site-assets/scoped-paths';
import { ValidationError } from '@/lib/api/errors';

/**
 * The hero route's original inline check carried a prediction: "a new
 * path-bearing field is exactly how it gets lost." It was right — the blocks
 * route shipped `image` and `gallery` with no check at all.
 *
 * The coverage test below is the mechanism that stops it happening a third
 * time. Everything else here is unit coverage of the extracted helper.
 */
describe('collectBlockAssetPaths', () => {
  it('collects an image block path', () => {
    expect(collectBlockAssetPaths('image', { imagePath: '42/content/a.webp' })).toEqual([
      { field: 'imagePath', value: '42/content/a.webp' },
    ]);
  });

  it('collects every gallery image with its index in the field path', () => {
    expect(
      collectBlockAssetPaths('gallery', {
        images: [{ imagePath: '42/content/a.webp' }, { imagePath: '42/content/b.webp' }],
      }),
    ).toEqual([
      { field: 'images.0.imagePath', value: '42/content/a.webp' },
      { field: 'images.1.imagePath', value: '42/content/b.webp' },
    ]);
  });

  it('collects both hero shapes', () => {
    expect(
      collectBlockAssetPaths('hero', {
        heroImagePath: '42/hero/legacy.webp',
        photos: [{ path: '42/hero/p.webp' }],
      }),
    ).toEqual([
      { field: 'heroImagePath', value: '42/hero/legacy.webp' },
      { field: 'photos.0.path', value: '42/hero/p.webp' },
    ]);
  });

  it('returns the BASE path for a legacy suffixed heroImagePath', () => {
    // A hero the v3 inspector has not migrated to `photos` — every newly
    // onboarded community — stores `heroImagePath` as the already-suffixed
    // 1600w variant (`HeroImageField` passes `result.variant1600Path` as
    // `legacyPath`). Every other consumer of hero imagery strips it
    // (`resolveHeroPhotos`, the canvas, the public renderer). This one must
    // too: the picker appends `.800w.webp` for its thumbnail and the public
    // renderer appends `.1600w.webp` again if the path is written back.
    expect(
      collectBlockAssetPaths('hero', { heroImagePath: '42/hero/legacy.jpg.1600w.webp' }),
    ).toEqual([{ field: 'heroImagePath', value: '42/hero/legacy.jpg' }]);
  });

  it('strips in the hero branch only — image and gallery paths are stored base already', () => {
    // Same scope as `resolveHeroPhotos`. The strip is a no-op without a
    // suffix (the modern-shape case above stays green), and it must not
    // start rewriting image/gallery paths, whose convention was always base.
    expect(
      collectBlockAssetPaths('image', { imagePath: '42/content/a.jpg.1600w.webp' }),
    ).toEqual([{ field: 'imagePath', value: '42/content/a.jpg.1600w.webp' }]);
  });

  it('returns nothing for block types that carry no asset paths', () => {
    expect(collectBlockAssetPaths('text', { body: 'hi' })).toEqual([]);
    expect(collectBlockAssetPaths('payments', { ctaTarget: 'https://x.test' })).toEqual([]);
  });

  it('tolerates malformed content rather than throwing', () => {
    expect(collectBlockAssetPaths('image', null)).toEqual([]);
    expect(collectBlockAssetPaths('gallery', { images: 'nope' })).toEqual([]);
    expect(collectBlockAssetPaths('gallery', { images: [null, { imagePath: '42/c/x.webp' }] })).toEqual(
      [{ field: 'images.1.imagePath', value: '42/c/x.webp' }],
    );
  });
});

describe('block-type coverage', () => {
  /**
   * Whether each block type carries storage paths that must be tenant-scoped.
   *
   * This is the guard rail. Adding a block type to `blockSchemaRegistry`
   * without deciding its entry here fails the next test — so a new
   * path-bearing type cannot silently route around
   * `assertPathsScopedToCommunity` the way `image` and `gallery` did.
   */
  const CARRIES_ASSET_PATHS: Record<string, boolean> = {
    hero: true,
    image: true,
    gallery: true,
    text: false,
    documents: false,
    meetings: false,
    announcements: false,
    contact: false,
    faq: false,
    amenities: false,
    payments: false,
  };

  it('classifies every block type in blockSchemaRegistry', () => {
    expect(Object.keys(CARRIES_ASSET_PATHS).sort()).toEqual(
      Object.keys(blockSchemaRegistry).sort(),
    );
  });

  it('returns paths for exactly the types classified as path-bearing', () => {
    // A representative populated content object per path-bearing type. If a
    // type is marked true but collectBlockAssetPaths has no case for it, this
    // fails — which is the omission we are guarding against.
    const samples: Record<string, unknown> = {
      hero: { photos: [{ path: '42/hero/a.webp' }] },
      image: { imagePath: '42/content/a.webp' },
      gallery: { images: [{ imagePath: '42/content/a.webp' }] },
    };
    for (const [blockType, carries] of Object.entries(CARRIES_ASSET_PATHS)) {
      if (!carries) continue;
      expect(
        collectBlockAssetPaths(blockType, samples[blockType]),
        `${blockType} is classified as path-bearing but collected no paths`,
      ).not.toEqual([]);
    }
  });
});

describe('assertPathsScopedToCommunity', () => {
  it('accepts paths under the community prefix', () => {
    expect(() =>
      assertPathsScopedToCommunity(42, [{ field: 'imagePath', value: '42/content/a.webp' }]),
    ).not.toThrow();
  });

  it('rejects a foreign community id', () => {
    expect(() =>
      assertPathsScopedToCommunity(42, [{ field: 'imagePath', value: '999/content/a.webp' }]),
    ).toThrow(ValidationError);
  });

  it('rejects a prefix that merely shares leading digits', () => {
    // `420/` starts with "42" but is a different tenant. The trailing slash in
    // the comparison is load-bearing.
    expect(() =>
      assertPathsScopedToCommunity(42, [{ field: 'imagePath', value: '420/content/a.webp' }]),
    ).toThrow(ValidationError);
  });

  it('preserves the exact error shape the hero route tests assert', () => {
    // hero.test.ts pins both messages, including the U+2026 ellipsis and the
    // 32-character truncation. Changing either breaks that suite.
    try {
      assertPathsScopedToCommunity(42, [{ field: 'photos.1.path', value: '999/hero/x.webp' }]);
      throw new Error('expected assertPathsScopedToCommunity to throw');
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.message).toBe('photos.1.path must reference this community');
      expect(validation.details).toEqual({
        fields: [
          {
            field: 'photos.1.path',
            message: 'Path must start with "42/" (got "999/hero/x.webp…")',
          },
        ],
      });
    }
  });

  it('still rejects a foreign legacy hero path — the strip touches the suffix, not the tenant segment', () => {
    expect(() =>
      assertPathsScopedToCommunity(
        42,
        collectBlockAssetPaths('hero', { heroImagePath: '999/hero/legacy.jpg.1600w.webp' }),
      ),
    ).toThrow('heroImagePath must reference this community');
  });

  it('reports the FIRST offending path when several are foreign', () => {
    expect(() =>
      assertPathsScopedToCommunity(42, [
        { field: 'images.0.imagePath', value: '42/content/ok.webp' },
        { field: 'images.1.imagePath', value: '999/content/bad.webp' },
        { field: 'images.2.imagePath', value: '998/content/bad.webp' },
      ]),
    ).toThrow('images.1.imagePath must reference this community');
  });
});
