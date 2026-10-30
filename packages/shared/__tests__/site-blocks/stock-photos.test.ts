/**
 * Stock hero photos: the two scenery photos a look can use before a community
 * has uploaded its own.
 *
 * They are served from the web app's `public/site-looks/` folder, not copied into
 * each community's storage. That is why a stock entry carries an id and no path:
 * storage paths must match `^\d+/(logo|hero|content)/`, and copying files into
 * every community's bucket would add quota accounting for nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  STOCK_PHOTO_ALT,
  STOCK_PHOTO_IDS,
  STOCK_PHOTO_SRC,
} from '../../src/site-blocks/stock-photos';
import { heroPhotoSchema } from '../../src/site-blocks/hero';
import { imagePathSchema } from '../../src/site-blocks/types';
import * as shared from '../../src/index';

describe('stock photos', () => {
  it('are exactly the sunset and the palm-lined street', () => {
    expect([...STOCK_PHOTO_IDS]).toEqual(['sunset', 'palms']);
  });

  it('serves each id from /site-looks/', () => {
    expect(STOCK_PHOTO_SRC).toEqual({
      sunset: '/site-looks/sunset.webp',
      palms: '/site-looks/palms.webp',
    });
  });

  it('has a source for every id and none for anything else', () => {
    expect(Object.keys(STOCK_PHOTO_SRC).sort()).toEqual([...STOCK_PHOTO_IDS].sort());
  });

  it('never looks like a community storage path', () => {
    // A stock photo that passed the storage-path check could be mistaken for one
    // community's upload, and the tenancy checks on real paths would then apply
    // to a file that belongs to no tenant.
    for (const id of STOCK_PHOTO_IDS) {
      expect(imagePathSchema.safeParse(STOCK_PHOTO_SRC[id]).success, id).toBe(false);
    }
  });

  it('has a description for every id and none for anything else', () => {
    expect(Object.keys(STOCK_PHOTO_ALT).sort()).toEqual([...STOCK_PHOTO_IDS].sort());
  });

  it('describes each photo in words a hero can store as it stands', () => {
    // The editor swaps one stock photo for the other and writes this description
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
  });
});
