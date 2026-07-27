/**
 * Hero imagery carry-forward.
 *
 * These exist because adding `photos` to `heroBlockSchema` broke three
 * pre-existing writers at once — the onboarding wizard's welcome step, its
 * hero-image step, and the v2 editor's hero form — all of which rebuilt hero
 * content from a hand-maintained allowlist that silently dropped the new
 * field. Two deleted a PM's entire gallery on any save; the third produced
 * content carrying both imagery shapes and dead-ended on a 400.
 *
 * The generalised lesson, worth keeping in view when the NEXT hero field is
 * added: an allowlist over a schema that other code can extend is a data-loss
 * bug on a timer.
 */
import { describe, it, expect } from 'vitest';
import type { HeroBlockContent } from '@propertypro/shared';
import {
  carryHeroImagery,
  replacePrimaryHeroImage,
} from '@/lib/site-editor/hero-imagery';

const PHOTOS = [
  { path: '7/hero/pool.jpg', alt: 'The pool' },
  { path: '7/hero/gym.jpg', decorative: true as const },
];

const withPhotos = { headline: 'Welcome', photos: PHOTOS } as HeroBlockContent;
const withLegacy = {
  headline: 'Welcome',
  heroImagePath: '7/hero/pool.jpg.1600w.webp',
  heroImageAlt: 'The pool',
} as HeroBlockContent;
const bare = { headline: 'Welcome' } as HeroBlockContent;

describe('carryHeroImagery', () => {
  it('carries a photo array through untouched', () => {
    // THE regression. Previously this field was simply absent from the
    // allowlist, so any save from these surfaces deleted the gallery.
    expect(carryHeroImagery(withPhotos)).toEqual({ photos: PHOTOS });
  });

  it('carries the legacy pair when that is the shape in use', () => {
    expect(carryHeroImagery(withLegacy)).toEqual({
      heroImagePath: '7/hero/pool.jpg.1600w.webp',
      heroImageAlt: 'The pool',
    });
  });

  it('never emits both shapes at once', () => {
    // heroBlockSchema refuses content carrying both, so emitting both would
    // turn every save from these surfaces into a 400.
    const both = { ...withPhotos, ...withLegacy } as HeroBlockContent;
    const carried = carryHeroImagery(both);
    expect(carried).toHaveProperty('photos');
    expect(carried).not.toHaveProperty('heroImagePath');
  });

  it('emits nothing for a hero with no imagery', () => {
    expect(carryHeroImagery(bare)).toEqual({});
    expect(carryHeroImagery(null)).toEqual({});
    expect(carryHeroImagery(undefined)).toEqual({});
  });

  it('ignores an empty photo array and falls through to the legacy pair', () => {
    const odd = { ...withLegacy, photos: [] } as HeroBlockContent;
    expect(carryHeroImagery(odd)).toEqual({
      heroImagePath: '7/hero/pool.jpg.1600w.webp',
      heroImageAlt: 'The pool',
    });
  });

  it('emits nothing when the legacy pair is half-set', () => {
    // heroBlockSchema requires alt whenever a path is present, so carrying a
    // lone path forward would make the payload unsaveable.
    const half = { headline: 'Welcome', heroImagePath: '7/hero/a.jpg' } as HeroBlockContent;
    expect(carryHeroImagery(half)).toEqual({});
  });
});

describe('replacePrimaryHeroImage', () => {
  const image = {
    photoPath: '7/hero/new.jpg',
    legacyPath: '7/hero/new.jpg.1600w.webp',
    alt: 'A new photo',
  };

  it('replaces slot 0 and keeps the rest of the gallery', () => {
    // The wizard step means "set the hero image", singular — that is slot 0.
    // The other photos are not its business.
    expect(replacePrimaryHeroImage(withPhotos, image)).toEqual({
      photos: [{ path: '7/hero/new.jpg', alt: 'A new photo' }, PHOTOS[1]],
    });
  });

  it('stores the BASE path in photos, not the 1600w variant', () => {
    // The renderer appends the variant suffixes; storing the suffixed path is
    // the legacy convention `stripVariantSuffix` exists to undo.
    const result = replacePrimaryHeroImage(withPhotos, image) as { photos: typeof PHOTOS };
    expect(result.photos[0]!.path).toBe('7/hero/new.jpg');
    expect(result.photos[0]!.path).not.toContain('1600w');
  });

  it('never emits both shapes, so the schema refine cannot fire', () => {
    // This is what turned the wizard into a dead end: spreading the existing
    // content and then setting heroImagePath on a photos hero produced an
    // unsaveable payload AFTER the upload had been finalized and charged.
    const result = replacePrimaryHeroImage(withPhotos, image);
    expect(result).toHaveProperty('photos');
    expect(result).not.toHaveProperty('heroImagePath');
  });

  it('keeps writing the legacy pair for a hero that has no photos', () => {
    // This helper does not migrate a hero on its own — that is the v3
    // inspector's job. Keeping the legacy shape here also keeps the wizard
    // out of the set of surfaces that produce new-shape rows.
    expect(replacePrimaryHeroImage(withLegacy, image)).toEqual({
      heroImagePath: '7/hero/new.jpg.1600w.webp',
      heroImageAlt: 'A new photo',
    });
    expect(replacePrimaryHeroImage(null, image)).toEqual({
      heroImagePath: '7/hero/new.jpg.1600w.webp',
      heroImageAlt: 'A new photo',
    });
  });
});
