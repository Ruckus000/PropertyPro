/**
 * The `<img>` attributes and React key for one hero photo, whichever kind it is.
 *
 * An upload lives in storage in two sizes, so it gets a srcset. A stock photo
 * (D3) is one file in the web app's `public/site-looks/`: there is one size, so
 * no srcset, and the width and height are the file's own, so the browser
 * reserves the right box before it loads. `HeroBlock` (one photo) and
 * `HeroPhotoStrip` (several) both draw through here, so they cannot disagree.
 *
 * Client-safe on purpose: HeroBlock is also what the editor canvas renders, so
 * this imports `./public-url`, never `./storage-paths` (which pulls node:crypto).
 */
import { STOCK_PHOTO_SRC, type ResolvedHeroPhoto, type StockPhotoId } from '@propertypro/shared';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';

/** Each stock photo file's pixel size. `hero-photo-img.test.ts` reads them from the files. */
export const STOCK_PHOTO_SIZE: Readonly<Record<StockPhotoId, { width: number; height: number }>> = {
  sunset: { width: 1440, height: 1080 },
  palms: { width: 1100, height: 1100 },
};

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
    return { src: STOCK_PHOTO_SRC[photo.stock], alt: photo.alt, ...STOCK_PHOTO_SIZE[photo.stock] };
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
