/**
 * Hero photo resolution — the single read-time upgrade from the legacy
 * single-image hero to the photo array.
 *
 * Shared rather than editor-local because three places have to agree on what a
 * hero's photos ARE: the public renderer, the editor canvas, and the
 * publish-time validator. A second implementation of this would be a source of
 * "it looked right in the editor" bugs.
 */
import type { HeroBlockContent } from './hero';

export interface ResolvedHeroPhoto {
  /** Base storage path — variant suffixes are appended at render time. */
  path: string;
  alt?: string;
  decorative?: true;
}

/**
 * Storage variant suffixes written by the image finalize endpoint.
 *
 * Longest first: `.800w.webp` and `.1600w.webp` do not overlap, but keeping
 * the ordering explicit means adding a `.400w.webp` later cannot silently
 * depend on array order.
 */
const VARIANT_SUFFIXES = ['.1600w.webp', '.800w.webp'] as const;

/**
 * Strip a rendered-variant suffix to recover the base storage path.
 *
 * Needed because two conventions exist in stored data. `ImageBlock` and
 * `GalleryBlock` store the BASE path and append `.1600w.webp` / `.800w.webp`
 * at render (finalize deletes the raw upload, so the base path itself is not
 * fetchable — only its variants are). The onboarding wizard's hero field
 * instead stored the already-suffixed 1600w path, and `HeroBlock` rendered it
 * verbatim.
 *
 * Base paths won: they are the majority convention, they are the only one that
 * permits a srcset on the largest image on a perf-budgeted page, and
 * `heroIssues`'s "alt text is just the filename" check reads a real filename
 * from them rather than `foo.jpg.1600w.webp`.
 *
 * So this exists forever, for rows written before that decision.
 */
export function stripVariantSuffix(path: string): string {
  for (const suffix of VARIANT_SUFFIXES) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
  }
  return path;
}

/**
 * The hero's photos, whichever shape they were stored in.
 *
 * Order of precedence:
 *   1. `photos` — the current shape.
 *   2. `heroImagePath` — upgraded to a one-element array, with any variant
 *      suffix stripped. This is why the change needs no backfill and has no
 *      window in which existing heroes render empty.
 *   3. neither — no photos.
 *
 * `heroBlockSchema` refuses content carrying both, so the precedence here is
 * defence in depth rather than a policy decision made in two places.
 */
export function resolveHeroPhotos(content: HeroBlockContent): ResolvedHeroPhoto[] {
  if (content.photos && content.photos.length > 0) {
    return content.photos.map((photo) => ({
      path: photo.path,
      ...(photo.alt !== undefined ? { alt: photo.alt } : {}),
      ...(photo.decorative === true ? { decorative: true as const } : {}),
    }));
  }

  if (content.heroImagePath) {
    return [
      {
        path: stripVariantSuffix(content.heroImagePath),
        ...(content.heroImageAlt !== undefined ? { alt: content.heroImageAlt } : {}),
      },
    ];
  }

  return [];
}
