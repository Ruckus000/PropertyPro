import type { HeroBlockContent, HeroPhoto } from '@propertypro/shared';

/**
 * Helpers for the hero writers that are NOT the v3 inspector.
 *
 * ## The hazard these exist to close
 *
 * Three surfaces write hero content by rebuilding it from a hard-coded
 * allowlist of fields — the onboarding wizard's welcome step, its hero-image
 * step, and the v2 editor's hero form. That was safe while the hero had a
 * fixed set of keys. It stopped being safe the moment `photos` was added:
 * every one of those allowlists silently dropped it, so saving any of those
 * forms for any reason — fixing a typo in the headline — destroyed a PM's
 * entire photo array with no warning and no undo.
 *
 * The lesson is structural, not incidental: **a hand-maintained allowlist over
 * a schema that other code can extend is a data-loss bug waiting for the next
 * field.** These helpers are the single place that knows how to carry hero
 * imagery forward, so the next field added to the hero has one place to
 * update rather than three to remember.
 */

/** The imagery keys of a hero, in whichever shape this hero uses. */
type HeroImagery =
  | { photos: HeroPhoto[] }
  | { heroImagePath: string; heroImageAlt: string }
  | Record<string, never>;

/**
 * The imagery fields to spread into a rebuilt hero payload.
 *
 * Never returns both shapes at once — `heroBlockSchema` refuses content
 * carrying `photos` and `heroImagePath` together, and `resolveHeroPhotos`
 * treats `photos` as authoritative, so `photos` wins when present.
 */
export function carryHeroImagery(existing: HeroBlockContent | null | undefined): HeroImagery {
  if (!existing) return {};

  if (existing.photos && existing.photos.length > 0) {
    return { photos: existing.photos };
  }

  if (existing.heroImagePath && existing.heroImageAlt) {
    return { heroImagePath: existing.heroImagePath, heroImageAlt: existing.heroImageAlt };
  }

  return {};
}

/**
 * The imagery fields for "the PM just uploaded a new primary hero image".
 *
 * When the hero already uses `photos`, the upload replaces slot 0 and leaves
 * the rest of the gallery alone — the wizard's step is "set the hero image",
 * singular, and slot 0 is what that means. Writing `heroImagePath` instead
 * would produce content carrying both shapes, which the schema refuses, and
 * the PM would hit a validation error in a wizard that has no photo UI to
 * resolve it with — after the upload had already been finalized and charged
 * against their storage quota.
 *
 * When the hero has no `photos`, the legacy pair is kept. This helper does not
 * migrate a hero on its own; that is the v3 inspector's job.
 *
 * Note `photoPath` is the BASE storage path and `legacyPath` the 1600w
 * variant — the two shapes genuinely differ, see `stripVariantSuffix`.
 */
export function replacePrimaryHeroImage(
  existing: HeroBlockContent | null | undefined,
  image: { photoPath: string; legacyPath: string; alt: string },
): HeroImagery {
  const photos = existing?.photos;
  if (photos && photos.length > 0) {
    return {
      photos: [{ path: image.photoPath, alt: image.alt }, ...photos.slice(1)],
    };
  }
  return { heroImagePath: image.legacyPath, heroImageAlt: image.alt };
}
