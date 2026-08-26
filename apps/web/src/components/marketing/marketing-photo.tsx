import React from 'react';

/**
 * The one place the photograph path is constructed.
 *
 * Two things are deliberate and coupled:
 *
 * 1. **Plain `<img>`, not `next/image`.** The repo has no `images` config and no
 *    `sharp`, and `perf-check` runs this page against a production `next start`
 *    with an unreachable database — on-demand image optimization would be a new
 *    failure mode there for no benefit. The widths are pre-generated instead, so
 *    `srcset` gets us responsive delivery at zero runtime cost.
 *
 * 2. **The `/v1/` path segment is a cache-busting version, not decoration.**
 *    `apps/web/vercel.json` serves `/marketing/v1/*` as `immutable` for a year.
 *    That is only safe because the directory is versioned — these filenames are
 *    not content-hashed. To replace a photograph, emit `v2/` and bump `ASSET_VERSION`;
 *    never overwrite a file inside a version that has shipped.
 *    (Same reasoning as the `address-autocomplete/v1/shard-*.json` rule above it.)
 */
const ASSET_VERSION = 'v1';

export interface MarketingPhotoProps {
  /** Base filename with no width suffix and no extension, e.g. `who-condo`. */
  name: string;
  /** Pre-generated widths, ascending. Must exist on disk under `public/marketing/<version>/`. */
  widths: readonly number[];
  /** Layout width hint for the browser's srcset pick. */
  sizes: string;
  /** Empty string for photographs whose meaning is carried by adjacent text. */
  alt: string;
  /** Intrinsic ratio — reserves the box so photos can't shift layout as they arrive. */
  width: number;
  height: number;
}

export function MarketingPhoto({ name, widths, sizes, alt, width, height }: MarketingPhotoProps) {
  const base = `/marketing/${ASSET_VERSION}/${name}`;
  return (
    <img
      src={`${base}-${widths[widths.length - 1]}.webp`}
      srcSet={widths.map((w) => `${base}-${w}.webp ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
    />
  );
}
