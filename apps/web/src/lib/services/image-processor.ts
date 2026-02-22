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
