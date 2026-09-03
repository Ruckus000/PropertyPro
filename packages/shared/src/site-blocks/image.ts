/**
 * Image block — single image with required alt text (unless explicitly decorative).
 * Path must conform to the {community_id}/{kind}/... Supabase Storage layout.
 */
import { z } from 'zod';
import { altTextSchema, blockVariantSchema, hiddenSchema, imagePathSchema } from './types';

export const imageBlockSchema = z
  .object({
    imagePath: imagePathSchema,
    altText: altTextSchema.optional(),
    decorative: z.literal(true).optional(),
    caption: z.string().min(1).max(200).optional(),
    /** Absent means `standard` — see blockVariantSchema. */
    variant: blockVariantSchema.optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
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

export type ImageBlockContent = z.infer<typeof imageBlockSchema>;
