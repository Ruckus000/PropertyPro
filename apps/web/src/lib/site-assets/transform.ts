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
    const meta = await sharp(input).metadata();
    if (
      (meta.width ?? 0) < crop.x + crop.width ||
      (meta.height ?? 0) < crop.y + crop.height
    ) {
      throw new Error(`Crop box ${JSON.stringify(crop)} exceeds source dimensions ${meta.width}x${meta.height}`);
    }
    bytes = await sharp(input).extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    }).toBuffer();
  }
  return resizeSiteImage(bytes);
}
