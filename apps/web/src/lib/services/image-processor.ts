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

const SITE_LOGO_MAX_WIDTH = 600;
const SITE_LOGO_MAX_HEIGHT = 180;
const SITE_LOGO_QUALITY = 90;

/**
 * Resize a (typically pre-cropped) logo to a wordmark-friendly WebP that fits
 * within SITE_LOGO_MAX_WIDTH × SITE_LOGO_MAX_HEIGHT, preserving aspect ratio
 * and never upscaling. Unlike resizeLogo (which cover-crops to a 400×400
 * square for avatar/auth contexts), this keeps the logo's shape so a
 * horizontal wordmark renders correctly in the public-site header. EXIF
 * stripped. Server-only (sharp).
 */
export async function resizeSiteLogo(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({
      width: SITE_LOGO_MAX_WIDTH,
      height: SITE_LOGO_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: SITE_LOGO_QUALITY })
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

/** Website editor v3, Phase 8 — favicon variants. */
export interface FaviconVariants {
  /** 32×32 PNG — the browser tab icon. */
  icon32: Buffer;
  /** 180×180 PNG — the iOS home-screen icon. */
  appleTouch180: Buffer;
}

const FAVICON_SIZE = 32;
const APPLE_TOUCH_SIZE = 180;

/**
 * Produce the two favicon variants from a raw upload.
 *
 * PNG rather than WebP, deliberately: `apple-touch-icon` has no WebP support
 * across the iOS versions that matter, and PNG is the format every browser
 * accepts for both slots. The sizes are small enough that WebP's advantage is
 * noise.
 *
 * Square `cover` crop from the centre. A favicon is displayed square in every
 * consumer, so letterboxing a non-square upload would just render as an image
 * with transparent bars; cropping is what the user expects to see.
 *
 * Re-encoding through sharp is also the sanitisation step. The upload allowlist
 * is JPEG/PNG/WebP — SVG is deliberately NOT accepted, since it is a scriptable
 * document format — and decoding to raw pixels then re-encoding discards any
 * metadata, colour profile or trailing payload the original carried.
 */
export async function resizeFavicon(input: Buffer): Promise<FaviconVariants> {
  const [icon32, appleTouch180] = await Promise.all([
    sharp(input)
      .resize(FAVICON_SIZE, FAVICON_SIZE, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer(),
    sharp(input)
      .resize(APPLE_TOUCH_SIZE, APPLE_TOUCH_SIZE, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer(),
  ]);

  return { icon32, appleTouch180 };
}
