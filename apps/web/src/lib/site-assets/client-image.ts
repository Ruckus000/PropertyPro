/**
 * Client-side image validation helpers for the site-asset upload flow
 * (spec §2.8 / §4.1 Step 3). Kept framework-free and side-effect-light so
 * the pure validators are unit-testable without a DOM image decode.
 *
 * The two-step upload (presign → PUT → finalize) accepts JPEG/PNG/WebP. The
 * hero image additionally requires a minimum source resolution so the
 * server-side 1600w/800w variants don't upscale.
 */

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Hero source constraints (spec §4.1 Step 3 — hero image). */
export const HERO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const HERO_MIN_WIDTH = 1600;
export const HERO_MIN_HEIGHT = 900;

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ImageValidationError =
  | { code: 'mime'; message: string }
  | { code: 'size'; message: string }
  | { code: 'dimensions'; message: string };

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

/**
 * Validate a selected file's MIME type and byte size BEFORE the (more
 * expensive) dimension decode. Returns null when valid.
 */
export function validateImageFile(
  file: { type: string; size: number },
  opts: { maxBytes: number },
): ImageValidationError | null {
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      code: 'mime',
      message: 'Use a JPEG, PNG, or WebP image.',
    };
  }
  if (file.size > opts.maxBytes) {
    return {
      code: 'size',
      message: `Image is too large (${formatMb(file.size)}). Max ${formatMb(opts.maxBytes)}.`,
    };
  }
  return null;
}

/**
 * Validate that source dimensions meet a minimum. Returns null when valid;
 * otherwise an error whose message states actual vs required (spec §4.1:
 * "Your image is 800×450, we need at least 1600×900.").
 */
export function validateMinDimensions(
  dims: ImageDimensions,
  min: ImageDimensions,
): ImageValidationError | null {
  if (dims.width < min.width || dims.height < min.height) {
    return {
      code: 'dimensions',
      message: `Your image is ${dims.width}×${dims.height}, we need at least ${min.width}×${min.height}.`,
    };
  }
  return null;
}

/**
 * Decode a file's natural dimensions in the browser. Thin wrapper around the
 * Image/object-URL dance; isolated here so components can inject a stub in
 * tests (jsdom does not decode images).
 */
export function readImageDimensions(file: Blob): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image. Try a different file.'));
    };
    img.src = url;
  });
}
