/**
 * Stock hero photos: scenery a look can show before a community has uploaded
 * its own.
 *
 * They are files in the web app's `public/site-looks/` folder, served from
 * there, and are NOT copied into each community's storage bucket. That is why a
 * stock hero photo carries an id and no `path`: storage paths must match
 * `^\d+/(logo|hero|content)/`, and copying the files per community would add
 * quota accounting for nothing.
 *
 * Only two of the marketing photos are scenery: a sunset over the water and a
 * palm-lined street. The aerial beach photo centres on condo towers, which a
 * Miami association could mistake for its own building, so it is not offered.
 */

export const STOCK_PHOTO_IDS = ['sunset', 'palms'] as const;

export type StockPhotoId = (typeof STOCK_PHOTO_IDS)[number];

/** Where each stock photo is served from, as a path under the web app's `public/` folder. */
export const STOCK_PHOTO_SRC: Readonly<Record<StockPhotoId, string>> = {
  sunset: '/site-looks/sunset.webp',
  palms: '/site-looks/palms.webp',
};

/**
 * A hero photo that is one of ours: an id and a description, never a path.
 * Tell it apart from an uploaded photo with `'stock' in photo`.
 */
export type StockHeroPhoto = { stock: StockPhotoId; alt: string };
