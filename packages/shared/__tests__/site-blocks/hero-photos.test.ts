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
import { STOCK_PHOTO_IDS } from '../../src/site-blocks/stock-photos';
import { siteIssues } from '../../src/site-diff/validate';

const PATH = '7/hero/pool.jpg';
/** A stock photo as the editor writes it: an id and a description, never a path. */
const STOCK = { stock: 'sunset', alt: 'Sunset over the water' } as const;

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

describe('heroPhotoSchema — stock photos', () => {
  const accepts = (photo: unknown) =>
    heroBlockSchema.safeParse(hero({ photos: [photo] as never })).success;

  it("hero accepts {stock:'sunset', alt}", () => {
    expect(accepts({ stock: 'sunset', alt: 'Sunset over the water' })).toBe(true);
  });

  it('accepts every stock photo we ship', () => {
    for (const stock of STOCK_PHOTO_IDS) {
      expect(accepts({ stock, alt: 'A Florida scene' }), stock).toBe(true);
    }
  });

  it("hero rejects {stock:'beach'}", () => {
    // An id we do not ship has no file to serve: the visitor would get an empty
    // hero. This holds with and without a description.
    expect(accepts({ stock: 'beach' })).toBe(false);
    expect(accepts({ stock: 'beach', alt: 'A beach' })).toBe(false);
  });

  it('hero rejects a photo with both stock and path', () => {
    // Two shapes in one photo has no single reading: it is either a file this
    // community uploaded or one of ours, never both.
    expect(accepts({ stock: 'sunset', path: PATH, alt: 'The pool' })).toBe(false);
    expect(accepts({ stock: 'sunset', path: PATH })).toBe(false);
  });

  it('requires a description, since a stock photo is still an image', () => {
    expect(accepts({ stock: 'sunset' })).toBe(false);
    expect(accepts({ stock: 'sunset', alt: '' })).toBe(false);
  });

  it('cannot be marked decorative', () => {
    // Stock photos are the page's scenery and are described. The decorative
    // opt-out belongs to uploaded photos.
    expect(accepts({ stock: 'sunset', decorative: true })).toBe(false);
    expect(accepts({ stock: 'sunset', alt: 'Sunset over the water', decorative: true })).toBe(false);
  });

  it('rejects unknown keys on a stock photo (mass assignment)', () => {
    expect(accepts({ ...STOCK, isAdmin: true })).toBe(false);
  });

  it('mixes with uploaded photos, and counts toward the cap with them', () => {
    expect(
      heroBlockSchema.safeParse(hero({ photos: [{ path: PATH, alt: 'The pool' }, STOCK] })).success,
    ).toBe(true);
    expect(
      heroBlockSchema.safeParse(hero({ photos: Array(MAX_HERO_PHOTOS).fill(STOCK) })).success,
    ).toBe(true);
    expect(
      heroBlockSchema.safeParse(hero({ photos: Array(MAX_HERO_PHOTOS + 1).fill(STOCK) })).success,
    ).toBe(false);
  });

  it('refuses content carrying a stock photo and the legacy single image', () => {
    expect(
      heroBlockSchema.safeParse(
        hero({ photos: [STOCK], heroImagePath: PATH, heroImageAlt: 'The pool' }),
      ).success,
    ).toBe(false);
  });

  it('leaves the uploaded-photo rules exactly as they were', () => {
    // The union must not loosen the original shape: a path with no alt is still
    // refused, and alt with decorative is still refused.
    expect(accepts({ path: PATH })).toBe(false);
    expect(accepts({ path: PATH, alt: 'x', decorative: true })).toBe(false);
    expect(accepts({ path: PATH, alt: 'The pool' })).toBe(true);
    expect(accepts({ path: PATH, decorative: true })).toBe(true);
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

  it('resolveHeroPhotos keeps stock entries in order', () => {
    // Uploaded and stock photos interleaved: the strip shows them in the order
    // the manager arranged, so the resolver may neither regroup nor drop either kind.
    const photos = [
      { path: PATH, alt: 'The pool' },
      { stock: 'palms' as const, alt: 'A palm-lined street' },
      { path: '7/hero/gym.jpg', decorative: true as const },
      { stock: 'sunset' as const, alt: 'Sunset over the water' },
    ];
    expect(resolveHeroPhotos(hero({ photos }))).toEqual(photos);
  });

  it('hands a lone stock photo through as a stock photo with no path', () => {
    const [only, ...rest] = resolveHeroPhotos(hero({ photos: [STOCK] }));
    expect(rest).toEqual([]);
    expect(only).toEqual(STOCK);
    // Consumers tell the two kinds apart with `'stock' in photo`.
    expect(only && 'stock' in only).toBe(true);
    expect(only && 'path' in only).toBe(false);
  });

  it('never makes a stock photo out of the legacy single image', () => {
    const [only] = resolveHeroPhotos(hero({ heroImagePath: PATH, heroImageAlt: 'The pool' }));
    expect(only).toBeDefined();
    expect(only && 'stock' in only).toBe(false);
  });

  it('never invents a stock photo for a hero with no imagery', () => {
    expect(resolveHeroPhotos(hero())).toEqual([]);
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

  it('still says WHY an undescribed upload is blocked, not just "Invalid input"', () => {
    // `photos` is a union now. When a photo matches neither branch, zod keeps
    // one branch's own messages only if the other branch failed on SHAPE (here:
    // the stock branch has no `stock` key); otherwise it collapses to one generic
    // "Invalid input". The manager-facing message for the common mistake (an
    // upload with no description) depends on that, and it is the sentence they
    // act on, so pin it.
    const messages = errors({ headline: 'Welcome home', photos: [{ path: PATH }] }).map(
      (issue) => issue.message,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/alt is required unless decorative/);
  });

  it('allows publish with a described stock photo, and warns about nothing', () => {
    // A stock photo has no path, so nothing that inspects a photo's path or
    // filename may run on it. If such a check read `photo.path` here it would
    // throw or warn on every look that ships a stock hero.
    expect(siteIssues(snapshot({ headline: 'Welcome home', photos: [STOCK] }) as never)).toEqual([]);
  });

  it('allows publish with stock and uploaded photos together', () => {
    expect(
      errors({ headline: 'Welcome home', photos: [STOCK, { path: PATH, alt: 'The pool' }] }),
    ).toEqual([]);
  });

  it('BLOCKS publish for a stock photo with no description', () => {
    expect(errors({ headline: 'Welcome home', photos: [{ stock: 'sunset' }] })).not.toEqual([]);
  });

  it('BLOCKS publish for a stock photo id we do not ship', () => {
    expect(
      errors({ headline: 'Welcome home', photos: [{ stock: 'beach', alt: 'A beach' }] }),
    ).not.toEqual([]);
  });
});
