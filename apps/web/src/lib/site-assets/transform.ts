import sharp from 'sharp';
import { resizeSiteImage, type SiteImageVariants } from '@/lib/services/image-processor';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Optionally crop the input bytes (client-side react-image-crop coordinates),
 * then pipe through resizeSiteImage to produce 1600w + 800w WebP variants.
 *
 * Throws on out-of-bounds or non-positive crop dimensions. The route handler
 * surfaces these as 400 VALIDATION_ERROR via withErrorHandler.
 */
export async function transformSiteImage(
  input: Buffer,
  crop?: CropBox,
): Promise<SiteImageVariants> {
  let bytes = input;
  if (crop) {
    if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0) {
      throw new Error(`Crop box must have non-negative origin and positive dimensions: ${JSON.stringify(crop)}`);
    }
    // Round client-supplied floats once and use the integers for BOTH the
    // bounds check and the sharp extract. Checking the raw floats can
    // reject valid crops where (x + width) is e.g. 1600.0000003 on a
    // 1600px image; rounding first keeps the check consistent with what
    // sharp actually receives.
    const left = Math.round(crop.x);
    const top = Math.round(crop.y);
    const width = Math.round(crop.width);
    const height = Math.round(crop.height);
    const meta = await sharp(input).metadata();
    if (
      (meta.width ?? 0) < left + width ||
      (meta.height ?? 0) < top + height
    ) {
      throw new Error(`Crop box ${JSON.stringify(crop)} exceeds source dimensions ${meta.width}x${meta.height}`);
    }
    bytes = await sharp(input).extract({ left, top, width, height }).toBuffer();
  }
  return resizeSiteImage(bytes);
}
