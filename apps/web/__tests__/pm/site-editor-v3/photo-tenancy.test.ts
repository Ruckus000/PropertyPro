/**
 * Photo reuse and tenancy — the contract the picker relies on.
 *
 * "Choose from your photos" offers paths already placed on THIS community's
 * site (`placedPhotos`), and the block write re-checks whatever comes back with
 * `assertPathsScopedToCommunity`. This file pins the three facts that make
 * that safe, at the function level:
 *
 *   1. The block schemas bind nothing to the tenant — `8/hero/pool.jpg` is
 *      shape-valid on community 7's image block — so the guard is the only
 *      thing between a foreign path and the row.
 *   2. The guard treats a `hero`-kind path exactly like a `content` one. The
 *      kind segment is not a tenancy signal; the leading id is.
 *   3. What the picker offers from a community's own site always passes the
 *      guard for that community, and what it would offer from another site
 *      never does. Both derive paths through the same `collectBlockAssetPaths`
 *      the route calls, so the picker cannot offer what the write path would
 *      not recognise.
 *
 * What this file is NOT: the revert-check for the route. Every case here calls
 * the helper directly, so commenting out the call in
 * `apps/web/src/app/api/v1/pm/site/blocks/route.ts` leaves all of them green.
 * The cases that redden under that fault are in
 * `apps/web/__tests__/api/pm/site/blocks.test.ts`, because only a request
 * through the route can observe whether the route still calls the guard.
 *
 * Argument order is `assertPathsScopedToCommunity(communityId, paths)` —
 * `communityId` FIRST — and `paths` is `ScopedPath[]` (`{ field, value }`),
 * not bare strings.
 */
import { describe, it, expect } from 'vitest';
import { blockSchemaRegistry } from '@propertypro/shared';
import { ValidationError } from '@/lib/api/errors';
import {
  assertPathsScopedToCommunity,
  collectBlockAssetPaths,
} from '@/lib/site-assets/scoped-paths';
import { placedPhotos } from '@/lib/site-editor/placed-photos';

const OURS = 7;
const THEIRS = 8;

const THEIR_HERO = `${THEIRS}/hero/pool.jpg`;
const OUR_HERO = `${OURS}/hero/pool.jpg`;

describe('the block schemas validate shape, not tenancy', () => {
  it('accept a foreign hero path on image and gallery blocks — any digits satisfy the schema', () => {
    // The exact schemas the route runs before the guard. If either ever
    // rejects this, the schema has started doing the guard's job; nothing
    // here should come to rely on that.
    expect(blockSchemaRegistry.image.safeParse({ imagePath: THEIR_HERO, altText: 'x' }).success).toBe(
      true,
    );
    expect(
      blockSchemaRegistry.gallery.safeParse({ images: [{ imagePath: THEIR_HERO, altText: 'x' }] })
        .success,
    ).toBe(true);
  });
});

describe('assertPathsScopedToCommunity on the hero kind', () => {
  it('rejects a hero photo from another community on an image block, naming imagePath', () => {
    const paths = collectBlockAssetPaths('image', { imagePath: THEIR_HERO, altText: 'Their pool' });
    expect(paths).toEqual([{ field: 'imagePath', value: THEIR_HERO }]);
    expect(() => assertPathsScopedToCommunity(OURS, paths)).toThrow(
      'imagePath must reference this community',
    );
  });

  it('rejects it at index 1 of a gallery, naming images.1.imagePath', () => {
    const paths = collectBlockAssetPaths('gallery', {
      images: [
        { imagePath: `${OURS}/content/ours.jpg`, altText: 'Ours' },
        { imagePath: THEIR_HERO, altText: 'Theirs' },
      ],
    });
    expect(() => assertPathsScopedToCommunity(OURS, paths)).toThrow(
      'images.1.imagePath must reference this community',
    );
  });

  it('carries the offending field and the expected prefix in details', () => {
    let caught: unknown;
    try {
      assertPathsScopedToCommunity(OURS, [{ field: 'imagePath', value: THEIR_HERO }]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).details).toEqual({
      fields: [
        {
          field: 'imagePath',
          message: `Path must start with "${OURS}/" (got "${THEIR_HERO}…")`,
        },
      ],
    });
  });

  it('accepts a hero photo from this community on an image block', () => {
    expect(() =>
      assertPathsScopedToCommunity(OURS, [{ field: 'imagePath', value: OUR_HERO }]),
    ).not.toThrow();
  });
});

describe('what the picker offers round-trips through the guard', () => {
  const ourSite = [
    {
      blockType: 'hero',
      blockOrder: 1,
      content: { headline: 'Welcome', photos: [{ path: `${OURS}/hero/strip.jpg`, alt: 'Strip' }] },
    },
    {
      blockType: 'image',
      blockOrder: 2,
      content: { imagePath: `${OURS}/content/pool.jpg`, altText: 'Pool' },
    },
    {
      blockType: 'gallery',
      blockOrder: 3,
      content: { images: [{ imagePath: `${OURS}/content/lobby.jpg`, altText: 'Lobby' }] },
    },
  ];

  // A community-8 site: what a picker fed the WRONG site's blocks would offer.
  const theirSite = [
    {
      blockType: 'hero',
      blockOrder: 1,
      content: { headline: 'Welcome', photos: [{ path: THEIR_HERO, alt: 'Pool' }] },
    },
    {
      blockType: 'image',
      blockOrder: 2,
      content: { imagePath: `${THEIRS}/content/lobby.jpg`, altText: 'Lobby' },
    },
  ];

  it('every photo placed on our own site passes for us — hero imagery included', () => {
    // Each chosen path is written back as an image/gallery imagePath and
    // re-checked by the route; a candidate the guard would refuse would be a
    // dead thumbnail in the picker.
    const offered = placedPhotos(ourSite).map((photo) => photo.path);
    expect(offered).toHaveLength(3);
    expect(offered).toContain(`${OURS}/hero/strip.jpg`);
    for (const path of offered) {
      expect(() =>
        assertPathsScopedToCommunity(OURS, collectBlockAssetPaths('image', { imagePath: path })),
      ).not.toThrow();
    }
  });

  it('every photo from another site is refused for us — hero imagery included', () => {
    const offered = placedPhotos(theirSite).map((photo) => photo.path);
    expect(offered).toHaveLength(2);
    expect(offered).toContain(THEIR_HERO);
    for (const path of offered) {
      expect(() =>
        assertPathsScopedToCommunity(OURS, collectBlockAssetPaths('image', { imagePath: path })),
      ).toThrow(ValidationError);
    }
  });
});
