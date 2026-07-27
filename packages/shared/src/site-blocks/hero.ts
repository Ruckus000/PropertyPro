/**
 * Hero block — PM-authored welcome panel with headline, optional subtitle,
 * optional CTA, optional hero image (with required alt text).
 *
 * Rendered first on every public site; carries the strongest visual weight.
 */
import { z } from 'zod';
import { altTextSchema, ctaTargetSchema, imagePathSchema } from './types';

/** Hero galleries are a highlight reel, not an album. */
export const MAX_HERO_PHOTOS = 8;

/**
 * One hero photo.
 *
 * `path` is the BASE storage path; the renderer appends `.1600w.webp` /
 * `.800w.webp`. See `stripVariantSuffix` in ./hero-photos for why, and for how
 * legacy rows that stored the suffixed path are handled.
 *
 * The alt/decorative rule mirrors `imageBlockSchema` exactly rather than
 * inventing a second accessibility contract.
 */
export const heroPhotoSchema = z
  .object({
    path: imagePathSchema,
    alt: altTextSchema.optional(),
    decorative: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (data) => (data.decorative === true ? data.alt == null : data.alt != null),
    {
      message:
        'alt is required unless decorative:true is set. decorative:true and alt cannot coexist.',
    },
  );

export const heroBlockSchema = z
  .object({
    headline: z.string().min(1).max(120),
    subtitle: z.string().min(1).max(280).optional(),
    ctaText: z.string().min(1).max(40).optional(),
    ctaTarget: ctaTargetSchema.optional(),
    photos: z.array(heroPhotoSchema).max(MAX_HERO_PHOTOS).optional(),
    /**
     * Legacy single-image pair. Retained, NOT removed.
     *
     * This schema is `.strict()`, so dropping these keys would make every hero
     * row stored before `photos` existed fail `safeParse` — and `HeroBlock`
     * returns null on a parse failure, so every community's hero would vanish
     * from its public site the moment this shipped. `resolveHeroPhotos`
     * upgrades them on read instead. Expand now; contract, if ever, only after
     * a backfill.
     */
    heroImagePath: imagePathSchema.optional(),
    heroImageAlt: altTextSchema.optional(),
  })
  .strict()
  .refine(
    (data) => (data.ctaText == null) === (data.ctaTarget == null),
    { message: 'ctaText and ctaTarget must both be present or both absent.' },
  )
  .refine(
    (data) => (data.heroImagePath == null) || (data.heroImageAlt != null),
    { message: 'heroImageAlt is required when heroImagePath is set.' },
  )
  .refine(
    // Both shapes at once has no single correct reading, and letting it
    // through would push the ambiguity out to every consumer.
    (data) => !(data.photos != null && data.photos.length > 0 && data.heroImagePath != null),
    {
      message:
        'photos and heroImagePath cannot both be set — photos replaces the legacy single image.',
    },
  );

export type HeroPhoto = z.infer<typeof heroPhotoSchema>;
export type HeroBlockContent = z.infer<typeof heroBlockSchema>;
