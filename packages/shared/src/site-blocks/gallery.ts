/**
 * Gallery block (Pro+) — a heading plus an ordered set of images, each with
 * required alt text (unless explicitly decorative) and an optional caption.
 *
 * Each image mirrors the single-image block's alt/decorative discipline and
 * the {community_id}/{kind}/... Supabase Storage path layout. Capped at 24
 * images to bound page weight against the per-plan storage quota and the
 * public-site performance budget.
 */
import { z } from 'zod';
import { altTextSchema, imagePathSchema } from './types';

export const galleryImageSchema = z
  .object({
    imagePath: imagePathSchema,
    altText: altTextSchema.optional(),
    decorative: z.literal(true).optional(),
    caption: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Either decorative=true (and no alt) OR altText provided (and no decorative flag).
      if (data.decorative === true) return data.altText == null;
      return data.altText != null;
    },
    {
      message:
        'altText is required unless decorative:true is set. decorative:true and altText cannot coexist.',
    },
  );

export const galleryBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    images: z.array(galleryImageSchema).min(1).max(24),
  })
  .strict();

export type GalleryImage = z.infer<typeof galleryImageSchema>;
export type GalleryBlockContent = z.infer<typeof galleryBlockSchema>;
