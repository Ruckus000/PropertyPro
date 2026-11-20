/**
 * Builds the stock welcome photos in `apps/web/public/site-looks/`.
 *
 * Each library photo is fetched from its Unsplash image id (recorded in
 * `STOCK_PHOTOS`), cropped to 3:2 and written as WebP at 2400, 1200 and 480
 * wide. The sources are approved, free under the Unsplash License; see
 * `apps/web/public/site-looks/CREDITS.md`.
 *
 *   pnpm exec tsx scripts/build-stock-photos.ts [id ...]
 *
 * Every file is WebP at quality 72, except the 2400 file of the two heaviest
 * look defaults (`QUALITY_2400`).
 *
 * Exit codes: 0 built, 1 a photo could not be processed as asked, 2 the build
 * could not run (a download failed, an unknown id, or a source narrower than
 * the largest output, which would be an upscale).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  PICKABLE_STOCK_PHOTO_IDS,
  STOCK_PHOTOS,
  stockPhotoSrc,
  type StockPhotoId,
  type StockPhotoWidth,
} from '@propertypro/shared';
import { isMainModule } from './lib/is-main-module';

const WIDTHS: readonly StockPhotoWidth[] = [2400, 1200, 480];
const QUALITY = 72;

export interface StockPhotoEncoding {
  quality: number;
}

/**
 * The 2400 file of the two heaviest look defaults, the image their look's page
 * paints first. Dense foliage left them at ~989 KB (palm-walk) and ~844 KB
 * (oak-avenue) at quality 72. Each takes the lowest quality that shows no
 * banding in its sky and no blocking in its foliage, viewed at 1:1 and 2x;
 * oak-avenue's moss starts to smear at 50, so it stops at 55. Never a blur: a
 * look's default photo must not look soft. The 1200 and 480 files keep 72.
 */
const QUALITY_2400: Partial<Record<StockPhotoId, number>> = {
  'palm-walk': 50,
  'oak-avenue': 55,
};

/** How a stock photo file is encoded. */
export function stockPhotoEncoding(id: StockPhotoId, width: StockPhotoWidth): StockPhotoEncoding {
  return { quality: (width === 2400 ? QUALITY_2400[id] : undefined) ?? QUALITY };
}

/** Where the crop is anchored when the default (`attention`) loses the subject. */
type CropPosition = 'attention' | 'entropy' | 'top' | 'bottom' | 'centre';
const CROP_POSITION: Partial<Record<StockPhotoId, CropPosition>> = {
  'palm-walk': 'bottom',
};

export function stockPhotoDownloadUrl(imageId: string): string {
  return `https://images.unsplash.com/${imageId}?w=4000&q=90&fm=jpg`;
}

class BuildCouldNotRun extends Error {}

async function download(id: StockPhotoId, imageId: string): Promise<Buffer> {
  const url = stockPhotoDownloadUrl(imageId);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new BuildCouldNotRun(`${id}: download failed (${String(err)})`);
  }
  if (!res.ok) throw new BuildCouldNotRun(`${id}: download failed (HTTP ${res.status} for ${url})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function buildStockPhotos(
  outDir: string,
  ids: readonly StockPhotoId[] = PICKABLE_STOCK_PHOTO_IDS,
): Promise<void> {
  if (ids.length === 0) throw new BuildCouldNotRun('no photos to build');
  await mkdir(outDir, { recursive: true });
  for (const id of ids) {
    const source = STOCK_PHOTOS[id].source;
    if (!source) throw new BuildCouldNotRun(`${id} is retired and has no source to fetch`);
    const original = await download(id, source.imageId);
    const meta = await sharp(original).metadata();
    if (!meta.width || meta.width < 2400) {
      throw new BuildCouldNotRun(`${id}: source is ${meta.width ?? '?'}px wide, under 2400`);
    }
    for (const width of WIDTHS) {
      const out = await sharp(original)
        .resize(width, (width * 2) / 3, { fit: 'cover', position: CROP_POSITION[id] ?? 'attention' })
        .webp(stockPhotoEncoding(id, width))
        .toBuffer();
      // stockPhotoSrc is `/site-looks/<file>`; only the file name is ours to join.
      await writeFile(join(outDir, stockPhotoSrc(id, width).replace('/site-looks/', '')), out);
    }
    console.info(`built ${id} (source ${meta.width}x${meta.height})`);
  }
}

async function main(): Promise<number> {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/site-looks');
  const requested = process.argv.slice(2);
  const unknown = requested.filter((id) => !(PICKABLE_STOCK_PHOTO_IDS as readonly string[]).includes(id));
  if (unknown.length > 0) {
    console.error(`unknown or retired photo id: ${unknown.join(', ')}`);
    return 2;
  }
  try {
    await buildStockPhotos(
      outDir,
      requested.length > 0 ? (requested as StockPhotoId[]) : PICKABLE_STOCK_PHOTO_IDS,
    );
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return err instanceof BuildCouldNotRun ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  void main().then((code) => process.exit(code));
}
