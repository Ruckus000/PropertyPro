/**
 * P3-47: Server-side image processing for white-label logo uploads.
 *
 * Uses sharp to resize and convert uploaded logos to a canonical format:
 * - 400×400 px (cover crop)
 * - WebP format, quality 80
 *
 * This module must NEVER be imported in client components — it relies on
 * the `sharp` native module which is server-only.
 */
import sharp from 'sharp';

const LOGO_SIZE = 400;
const LOGO_QUALITY = 80;

/**
 * Resize and convert an image buffer to a 400×400 WebP.
 *
 * @param input - Raw bytes of the uploaded image (PNG, JPEG, WebP, etc.)
 * @returns WebP-encoded Buffer, ≤ 400×400 px
 */
export async function resizeLogo(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'cover', position: 'center' })
    .webp({ quality: LOGO_QUALITY })
    .toBuffer();
}

const SITE_IMAGE_QUALITY = 82;

export interface SiteImageVariants {
  at1600w: Buffer;
  at800w: Buffer;
}

/**
 * Resize a site asset image to two WebP variants (1600w + 800w). Aspect
 * ratio preserved; never upscales beyond input width. EXIF stripped.
 *
 * Used by the finalize endpoint (PR #2) to produce CDN-friendly variants
 * from raw uploads.
 */
export async function resizeSiteImage(input: Buffer): Promise<SiteImageVariants> {
  const meta = await sharp(input).metadata();
  const sourceWidth = meta.width ?? 0;
  const target1600 = Math.min(sourceWidth, 1600);
  const target800 = Math.min(sourceWidth, 800);

  const [at1600w, at800w] = await Promise.all([
    sharp(input).resize({ width: target1600, withoutEnlargement: true }).webp({ quality: SITE_IMAGE_QUALITY }).toBuffer(),
    sharp(input).resize({ width: target800, withoutEnlargement: true }).webp({ quality: SITE_IMAGE_QUALITY }).toBuffer(),
  ]);

  return { at1600w, at800w };
}
