/**
 * The `<img>` attributes and React key for one hero photo, whichever kind it is.
 *
 * An upload lives in storage in two sizes, so it gets a srcset. A library stock
 * photo lives in the web app's `public/site-looks/` in three widths and gets a
 * srcset of its two larger ones. The two retired photos (`sunset`, `palms`) are
 * still one file each, so no srcset. The width and height are the file's own,
 * so the browser reserves the right box before it loads. `HeroBlock` (one photo) and
 * `HeroPhotoStrip` (several) both draw through here, so they cannot disagree.
 *
 * Client-safe on purpose: HeroBlock is also what the editor canvas renders, so
 * this imports `./public-url`, never `./storage-paths` (which pulls node:crypto).
 */
import {
  STOCK_PHOTOS,
  STOCK_PHOTO_IDS,
  STOCK_PHOTO_SRC,
  stockPhotoSrc,
  type ResolvedHeroPhoto,
  type StockPhotoId,
} from '@propertypro/shared';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';

type PhotoSize = { width: number; height: number };

/** Every library photo is built 3:2 at 2400 wide (`scripts/build-stock-photos.ts`). */
const LIBRARY_SIZE: PhotoSize = { width: 2400, height: 1600 };

/** The two retired photos are single files of their own size. */
const RETIRED_SIZE: Partial<Record<StockPhotoId, PhotoSize>> = {
  sunset: { width: 1440, height: 1080 },
  palms: { width: 1100, height: 1100 },
};

/** Each stock photo file's pixel size. `hero-photo-img.test.ts` reads them from the files. */
export const STOCK_PHOTO_SIZE: Readonly<Record<StockPhotoId, PhotoSize>> = Object.fromEntries(
  STOCK_PHOTO_IDS.map((id) => [id, RETIRED_SIZE[id] ?? LIBRARY_SIZE]),
) as Record<StockPhotoId, PhotoSize>;

export interface HeroPhotoImgAttributes {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  width: number;
  height: number;
}

export function heroPhotoImgAttributes(photo: ResolvedHeroPhoto): HeroPhotoImgAttributes {
  if ('stock' in photo) {
    const size = STOCK_PHOTO_SIZE[photo.stock];
    if (STOCK_PHOTOS[photo.stock].retired) {
      return { src: STOCK_PHOTO_SRC[photo.stock], alt: photo.alt, ...size };
    }
    const medium = stockPhotoSrc(photo.stock, 1200);
    const large = stockPhotoSrc(photo.stock, 2400);
    return {
      src: large,
      srcSet: `${medium} 1200w, ${large} 2400w`,
      // A look's HeroImg overrides this per hero style once a srcset exists.
      sizes: '100vw',
      alt: photo.alt,
      ...size,
    };
  }
  // Variants are siblings of the base path; finalize deletes the raw upload, so
  // the base path itself would 404.
  const large = buildPublicAssetUrl(`${photo.path}.1600w.webp`);
  return {
    src: large,
    srcSet: `${buildPublicAssetUrl(`${photo.path}.800w.webp`)} 800w, ${large} 1600w`,
    sizes: '(min-width: 1024px) 768px, 100vw',
    alt: photo.decorative === true ? '' : (photo.alt ?? ''),
    width: 1600,
    height: 900,
  };
}

/**
 * A React key unique within one hero. An upload is keyed by its path, which
 * follows it when the photos are reordered. A stock photo has no path and the
 * same one may appear twice, so it takes its position too; a storage path
 * always starts with a community id, so the two kinds cannot collide.
 */
export function heroPhotoKey(photo: ResolvedHeroPhoto, index: number): string {
  return 'stock' in photo ? `stock-${photo.stock}-${index}` : photo.path;
}
