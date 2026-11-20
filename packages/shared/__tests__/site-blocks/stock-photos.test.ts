/**
 * Stock hero photos: the scenery photos a look can use before a community
 * has uploaded its own.
 *
 * They are served from the web app's `public/site-looks/` folder, not copied into
 * each community's storage. That is why a stock entry carries an id and no path:
 * storage paths must match `^\d+/(logo|hero|content)/`, and copying files into
 * every community's bucket would add quota accounting for nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  PICKABLE_STOCK_PHOTO_IDS,
  STOCK_PHOTOS,
  STOCK_PHOTO_ALT,
  STOCK_PHOTO_IDS,
  STOCK_PHOTO_SRC,
  stockPhotoSrc,
  type StockPhotoWidth,
} from '../../src/site-blocks/stock-photos';
import { heroPhotoSchema } from '../../src/site-blocks/hero';
import { imagePathSchema } from '../../src/site-blocks/types';
import * as shared from '../../src/index';

const WIDTHS: readonly StockPhotoWidth[] = [480, 1200, 2400];

describe('stock photos', () => {
  it('are the thirteen library photos, then the two retired ones', () => {
    expect([...STOCK_PHOTO_IDS]).toEqual([
      'pilings-dusk',
      'gulf-sunset',
      'shoreline',
      'oak-avenue',
      'lake-reflection',
      'royal-palms',
      'palm-walk',
      'sea-oats',
      'palm-sky',
      'marsh-sunset',
      'dune-sunset',
      'mangrove-boardwalk',
      'sailboats',
      'sunset',
      'palms',
    ]);
  });

  it('offers the thirteen non-retired photos, in library order', () => {
    expect(PICKABLE_STOCK_PHOTO_IDS).toEqual(
      STOCK_PHOTO_IDS.filter((id) => !STOCK_PHOTOS[id].retired),
    );
    expect(PICKABLE_STOCK_PHOTO_IDS).toHaveLength(13);
    expect(STOCK_PHOTOS.sunset.retired).toBe(true);
    expect(STOCK_PHOTOS.palms.retired).toBe(true);
  });

  it('has a record for every id and none for anything else', () => {
    expect(Object.keys(STOCK_PHOTOS).sort()).toEqual([...STOCK_PHOTO_IDS].sort());
    expect(Object.keys(STOCK_PHOTO_SRC).sort()).toEqual([...STOCK_PHOTO_IDS].sort());
    expect(Object.keys(STOCK_PHOTO_ALT).sort()).toEqual([...STOCK_PHOTO_IDS].sort());
  });

  it('serves a library photo by width and a retired one from its single file', () => {
    expect(stockPhotoSrc('palm-walk', 480)).toBe('/site-looks/palm-walk.480.webp');
    expect(stockPhotoSrc('sunset', 1200)).toBe('/site-looks/sunset.webp');
    expect(stockPhotoSrc('palms', 480)).toBe('/site-looks/palms.webp');
    expect(STOCK_PHOTO_SRC['palm-walk']).toBe('/site-looks/palm-walk.2400.webp');
    expect(STOCK_PHOTO_SRC.sunset).toBe('/site-looks/sunset.webp');
  });

  it('names every photo, uniquely', () => {
    const names = STOCK_PHOTO_IDS.map((id) => STOCK_PHOTOS[id].name);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it('records an Unsplash source for every pickable photo and none for retired ones', () => {
    for (const id of STOCK_PHOTO_IDS) {
      const { retired, source } = STOCK_PHOTOS[id];
      if (retired) {
        expect(source, id).toBeNull();
        continue;
      }
      expect(source?.page, id).toMatch(/^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]+$/);
      expect(source?.imageId, id).toMatch(/^photo-\d+-[0-9a-f]+$/);
    }
  });

  it('keeps the retired photos descriptions, which stored rows depend on', () => {
    expect(STOCK_PHOTO_ALT.sunset).toBe('Sunset over the water, with palm trees in silhouette');
    expect(STOCK_PHOTO_ALT.palms).toBe('A quiet street lined with tall palm trees');
  });

  it('never looks like a community storage path', () => {
    // A stock photo that passed the storage-path check could be mistaken for one
    // community's upload, and the tenancy checks on real paths would then apply
    // to a file that belongs to no tenant.
    for (const id of STOCK_PHOTO_IDS) {
      for (const width of WIDTHS) {
        expect(imagePathSchema.safeParse(stockPhotoSrc(id, width)).success, `${id} ${width}`).toBe(
          false,
        );
      }
      expect(imagePathSchema.safeParse(STOCK_PHOTO_SRC[id]).success, id).toBe(false);
    }
  });

  it('describes each photo in words a hero can store as it stands', () => {
    // The editor swaps one stock photo for another and writes this description
    // with it, so it has to satisfy the same schema a typed one does.
    for (const id of STOCK_PHOTO_IDS) {
      expect(heroPhotoSchema.safeParse({ stock: id, alt: STOCK_PHOTO_ALT[id] }).success, id).toBe(
        true,
      );
    }
  });

  it('are re-exported from the package entry point', () => {
    expect(shared.STOCK_PHOTO_IDS).toBe(STOCK_PHOTO_IDS);
    expect(shared.STOCK_PHOTO_SRC).toBe(STOCK_PHOTO_SRC);
    expect(shared.STOCK_PHOTO_ALT).toBe(STOCK_PHOTO_ALT);
    expect(shared.STOCK_PHOTOS).toBe(STOCK_PHOTOS);
    expect(shared.PICKABLE_STOCK_PHOTO_IDS).toBe(PICKABLE_STOCK_PHOTO_IDS);
    expect(shared.stockPhotoSrc).toBe(stockPhotoSrc);
  });
});
