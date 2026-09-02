/**
 * The candidate list behind "Choose from your photos".
 *
 * Derived from blocks the editor already holds — the whole-site list from
 * `useContentBlocks`, NOT the page-narrowed one the editor context exposes —
 * through the same `collectBlockAssetPaths` that guards the write path. No
 * endpoint, no storage listing. What that buys and what it costs is pinned
 * here: every referenced path is offered exactly once, the hero's imagery
 * counts as "on the site", and a photo referenced by nothing is not offered
 * at all (the orphan case the spec accepts).
 */
import { describe, it, expect } from 'vitest';
import { placedPhotos } from '@/lib/site-editor/placed-photos';

const POOL = '1/content/pool.jpg';
const LOBBY = '1/content/lobby.jpg';

const blocks = [
  { blockType: 'image', blockOrder: 2, content: { imagePath: POOL, altText: 'Pool' } },
  {
    blockType: 'gallery',
    blockOrder: 3,
    content: {
      images: [
        { imagePath: POOL, altText: 'Pool again' },
        { imagePath: LOBBY, altText: 'Lobby' },
      ],
    },
  },
  { blockType: 'text', blockOrder: 4, content: { body: 'no photos here' } },
];

describe('placedPhotos', () => {
  it('returns each distinct path once', () => {
    expect(placedPhotos(blocks).map((p) => p.path).sort()).toEqual([LOBBY, POOL]);
  });

  it('counts how many sections use a photo', () => {
    const pool = placedPhotos(blocks).find((p) => p.path === POOL);
    expect(pool?.useCount).toBe(2);
  });

  it('counts SECTIONS, not placements — a gallery holding the same photo twice is one', () => {
    // The picker's label reads "In N sections". A gallery that repeats a photo
    // is one section, and saying "2" there would tell the PM the photo is used
    // somewhere else on the site when it is not.
    const twice = [
      {
        blockType: 'gallery',
        blockOrder: 2,
        content: {
          images: [
            { imagePath: POOL, altText: 'Pool' },
            { imagePath: POOL, altText: 'Pool, cropped' },
          ],
        },
      },
    ];
    expect(placedPhotos(twice)).toEqual([expect.objectContaining({ path: POOL, useCount: 1 })]);
  });

  it("offers the hero's photos — both the photos array and the legacy single image", () => {
    // The spec's motivating case is "reusing the pool photo in the hero and the
    // gallery", and `imagePathSchema` accepts the `hero` kind on image and
    // gallery blocks, so a hero photo is a valid target for either.
    const withHero = [
      {
        blockType: 'hero',
        blockOrder: 1,
        content: {
          headline: 'Welcome',
          photos: [{ path: '1/hero/strip.jpg', alt: 'Strip' }],
        },
      },
      {
        blockType: 'hero',
        blockOrder: 1,
        content: { headline: 'Welcome', heroImagePath: '1/hero/legacy.jpg', heroImageAlt: 'L' },
      },
      ...blocks,
    ];
    expect(placedPhotos(withHero).map((p) => p.path).sort()).toEqual([
      LOBBY,
      POOL,
      '1/hero/legacy.jpg',
      '1/hero/strip.jpg',
    ]);
  });

  it('offers a legacy hero image by its BASE path, not the stored 1600w variant', () => {
    // A hero the v3 inspector has not yet migrated to `photos` — every newly
    // onboarded community — stores `heroImagePath` already suffixed. The
    // picker appends `.800w.webp` for its thumbnail and the public renderer
    // appends `.1600w.webp` on the published site, so a verbatim path renders
    // `x.jpg.1600w.webp.800w.webp` here and publishes a double suffix if
    // picked (`imagePathSchema` allows dots, so the write would not refuse it).
    const legacy = [
      {
        blockType: 'hero',
        blockOrder: 1,
        content: {
          headline: 'Welcome',
          heroImagePath: '1/hero/x.jpg.1600w.webp',
          heroImageAlt: 'X',
        },
      },
    ];
    expect(placedPhotos(legacy).map((p) => p.path)).toEqual(['1/hero/x.jpg']);
  });

  it('dedupes a hero carrying both shapes for the same image to one candidate', () => {
    // `heroBlockSchema` refuses both at once, but a row written before that
    // rule can still hold them. After the strip they are one path, and the
    // picker keys on path — so one candidate, counted as one section.
    const both = [
      {
        blockType: 'hero',
        blockOrder: 1,
        content: {
          headline: 'Welcome',
          heroImagePath: '1/hero/x.jpg.1600w.webp',
          photos: [{ path: '1/hero/x.jpg', alt: 'X' }],
        },
      },
    ];
    expect(placedPhotos(both)).toEqual([
      expect.objectContaining({ path: '1/hero/x.jpg', useCount: 1 }),
    ]);
  });

  it('returns nothing when no block references a photo', () => {
    expect(placedPhotos([blocks[2]!])).toEqual([]);
  });

  it('ignores malformed content rather than throwing', () => {
    expect(placedPhotos([{ blockType: 'image', blockOrder: 2, content: null }])).toEqual([]);
    expect(placedPhotos([{ blockType: 'gallery', blockOrder: 2, content: { images: 'nope' } }])).toEqual([]);
  });

  it('names a photo by its upload filename, without the uuid the writer prefixed', () => {
    // `buildSiteAssetPath` writes `{uuid}-{sanitized filename}`. The uuid is
    // noise to a person; the filename is the only human-meaningful thing the
    // path carries, and it is what makes one thumbnail's accessible name
    // distinguishable from the next.
    const uuid = '3f2a9c1e-7b4d-4e8a-9f0c-1d2e3f4a5b6c';
    const named = placedPhotos([
      {
        blockType: 'image',
        blockOrder: 2,
        content: { imagePath: `1/content/${uuid}-pool_deck.jpg`, altText: 'Deck' },
      },
    ]);
    expect(named[0]?.name).toBe('pool_deck.jpg');
  });

  it('falls back to the whole filename segment when there is no uuid prefix', () => {
    expect(placedPhotos(blocks).find((p) => p.path === POOL)?.name).toBe('pool.jpg');
  });
});
