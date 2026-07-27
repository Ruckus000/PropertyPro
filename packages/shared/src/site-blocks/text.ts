/**
 * Text block — plain-text body with optional heading. No HTML, no markdown.
 * Sanitization-free by construction.
 */
import { z } from 'zod';
import { blockVariantSchema } from './types';

export const textBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    body: z.string().min(1).max(2000),
    /** Absent means `standard` — see blockVariantSchema. */
    variant: blockVariantSchema.optional(),
  })
  .strict();

export type TextBlockContent = z.infer<typeof textBlockSchema>;
