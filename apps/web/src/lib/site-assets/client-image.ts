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

/**
 * In-page (`kind: 'content'`) image cap. Mirrors `MAX_FILE_SIZE_BYTES` in
 * `/api/v1/site/uploads/presign`'s contract, so a file that would 400 there is
 * refused before the round trip.
 *
 * Deliberately its own constant rather than an alias of `HERO_MAX_BYTES`:
 * the two are numerically equal today but answer to different authorities (the
 * bucket setting vs. the hero spec), and aliasing would make a future change to
 * either one silently move the other.
 *
 * There is no content equivalent of `HERO_MIN_WIDTH`/`HEIGHT`, and there should
 * not be: that floor exists so the server's 1600w variant does not upscale a
 * full-bleed hero. An in-page image mirrors no such server rule, and applying
 * 1600×900 to it would reject perfectly good photos to prevent a cosmetically
 * soft 800w variant.
 */
export const CONTENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * What to send the upload pipeline as `altText` for a DECORATIVE image.
 *
 * `/api/v1/site/images/finalize` requires `altText: z.string().min(1)`, but a
 * decorative image carries no alt in block content — by definition, that is
 * what decorative means. Sending `''` presigns and PUTs the bytes and only
 * then 400s, stranding a raw object in the bucket every attempt.
 *
 * Sending the filename instead would be worse: presign accepts a filename up
 * to 255 chars while finalize caps altText at 200, so a long filename
 * reintroduces the same failure in a rarer form, and filenames are user data
 * heading into an audit-log field.
 *
 * This value is never rendered. finalize writes it only to the audit-log
 * `metadata` blob and echoes it back; the authoritative alt is the one stored
 * in block content.
 */
export const DECORATIVE_PLACEHOLDER_ALT = 'Decorative image';

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
