/**
 * Text block — plain-text body with optional heading. No HTML, no markdown.
 * Sanitization-free by construction.
 */
import { z } from 'zod';

export const textBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    body: z.string().min(1).max(2000),
  })
  .strict();

export type TextBlockContent = z.infer<typeof textBlockSchema>;
