/**
 * Hero photos — the schema rules and the read-time upgrade from the legacy
 * single image.
 *
 * The upgrade is the load-bearing part: it is what makes `photos` a jsonb
 * shape change with no backfill and no window in which existing heroes render
 * empty. If it regresses, every community that set a hero image before this
 * shipped loses it from their public site.
 */
import { describe, it, expect } from 'vitest';
import {
  heroBlockSchema,
  MAX_HERO_PHOTOS,
  type HeroBlockContent,
} from '../../src/site-blocks/hero';
import { resolveHeroPhotos, stripVariantSuffix } from '../../src/site-blocks/hero-photos';
import { siteIssues } from '../../src/site-diff/validate';

const PATH = '7/hero/pool.jpg';

function hero(overrides: Partial<HeroBlockContent> = {}): HeroBlockContent {
  return { headline: 'Welcome home', ...overrides } as HeroBlockContent;
}

describe('heroPhotoSchema — the alt rule', () => {
  it('accepts a photo with alt text', () => {
    expect(heroBlockSchema.safeParse(hero({ photos: [{ path: PATH, alt: 'The pool' }] })).success)
      .toBe(true);
  });

  it('accepts a photo explicitly marked decorative', () => {
    expect(heroBlockSchema.safeParse(hero({ photos: [{ path: PATH, decorative: true }] })).success)
      .toBe(true);
  });

  it('rejects a non-decorative photo with no alt text', () => {
    // This is the accessibility rule the publish gate leans on.
    expect(heroBlockSchema.safeParse(hero({ photos: [{ path: PATH }] })).success).toBe(false);
  });

  it('rejects a photo that is both decorative and described', () => {
    expect(
      heroBlockSchema.safeParse(hero({ photos: [{ path: PATH, alt: 'x', decorative: true }] }))
        .success,
    ).toBe(false);
  });

  it('rejects a path outside the storage layout', () => {
    expect(heroBlockSchema.safeParse(hero({ photos: [{ path: '../etc/passwd', alt: 'x' }] })).success)
      .toBe(false);
  });

  it('rejects unknown keys on a photo (mass assignment)', () => {
    expect(
      heroBlockSchema.safeParse(
        hero({ photos: [{ path: PATH, alt: 'x', isAdmin: true }] as never }),
      ).success,
    ).toBe(false);
  });

  it(`accepts exactly ${MAX_HERO_PHOTOS} photos and rejects one more`, () => {
    const photo = { path: PATH, alt: 'The pool' };
    expect(
      heroBlockSchema.safeParse(hero({ photos: Array(MAX_HERO_PHOTOS).fill(photo) })).success,
    ).toBe(true);
    expect(
      heroBlockSchema.safeParse(hero({ photos: Array(MAX_HERO_PHOTOS + 1).fill(photo) })).success,
    ).toBe(false);
  });

  it('refuses content carrying both photos and the legacy single image', () => {
    // Two shapes at once has no single correct reading; rejecting keeps the
    // ambiguity out of every consumer.
    expect(
      heroBlockSchema.safeParse(
        hero({
          photos: [{ path: PATH, alt: 'x' }],
          heroImagePath: PATH,
          heroImageAlt: 'y',
        }),
      ).success,
    ).toBe(false);
  });
});

describe('stripVariantSuffix', () => {
  it('strips the 1600w variant the onboarding wizard used to store', () => {
    expect(stripVariantSuffix(`${PATH}.1600w.webp`)).toBe(PATH);
  });

  it('strips the 800w variant', () => {
    expect(stripVariantSuffix(`${PATH}.800w.webp`)).toBe(PATH);
  });

  it('leaves a base path untouched', () => {
    expect(stripVariantSuffix(PATH)).toBe(PATH);
  });

  it('does not strip a lookalike that is not a variant suffix', () => {
    expect(stripVariantSuffix('7/hero/1600w.webp')).toBe('7/hero/1600w.webp');
  });
});

describe('resolveHeroPhotos — the read-time upgrade', () => {
  it('upgrades a legacy single image to a one-element array', () => {
    expect(resolveHeroPhotos(hero({ heroImagePath: PATH, heroImageAlt: 'The pool' }))).toEqual([
      { path: PATH, alt: 'The pool' },
    ]);
  });

  it('strips the variant suffix from a legacy path', () => {
    // The onboarding wizard stored `result.variant1600Path`, i.e. the already
    // -suffixed path, while ImageBlock/GalleryBlock store the base. Without
    // this the strip would request `foo.jpg.1600w.webp.1600w.webp`.
    expect(
      resolveHeroPhotos(hero({ heroImagePath: `${PATH}.1600w.webp`, heroImageAlt: 'The pool' })),
    ).toEqual([{ path: PATH, alt: 'The pool' }]);
  });

  it('returns the photo array when one is present', () => {
    const photos = [
      { path: PATH, alt: 'The pool' },
      { path: '7/hero/gym.jpg', decorative: true as const },
    ];
    expect(resolveHeroPhotos(hero({ photos }))).toEqual(photos);
  });

  it('returns nothing for a hero with no imagery', () => {
    expect(resolveHeroPhotos(hero())).toEqual([]);
  });

  it('treats an empty photo array as no imagery, falling back to the legacy pair', () => {
    expect(
      resolveHeroPhotos(hero({ photos: [], heroImagePath: PATH, heroImageAlt: 'The pool' })),
    ).toEqual([{ path: PATH, alt: 'The pool' }]);
  });
});

describe('publish gate — hero photos', () => {
  // `publishBlocked` is simply "any issue of severity error", so asserting on
  // error issues IS asserting on the gate.
  const snapshot = (content: unknown) => ({
    hero: { slot: 1, blockType: 'hero', content },
    sections: [],
  });
  const errors = (content: unknown) =>
    siteIssues(snapshot(content) as never).filter((i) => i.severity === 'error');

  it('BLOCKS publish for a non-decorative photo with no alt text', () => {
    // The requirement this phase names explicitly. The review sheet runs the
    // same validator client-side, but a client-only check is a suggestion —
    // this is the gate.
    expect(errors({ headline: 'Welcome home', photos: [{ path: PATH }] })).not.toEqual([]);
  });

  it('allows publish when every photo is described', () => {
    expect(errors({ headline: 'Welcome home', photos: [{ path: PATH, alt: 'The pool' }] }))
      .toEqual([]);
  });

  it('allows publish when a photo is explicitly decorative', () => {
    expect(errors({ headline: 'Welcome home', photos: [{ path: PATH, decorative: true }] }))
      .toEqual([]);
  });

  it('blocks when ONE photo in a set is undescribed', () => {
    expect(
      errors({
        headline: 'Welcome home',
        photos: [{ path: PATH, alt: 'The pool' }, { path: '7/hero/gym.jpg' }],
      }),
    ).not.toEqual([]);
  });

  it('still allows a legacy single-image hero through', () => {
    // The upgrade path must not become a publish blocker for content that was
    // already live.
    expect(errors({ headline: 'Welcome home', heroImagePath: PATH, heroImageAlt: 'The pool' }))
      .toEqual([]);
  });
});
