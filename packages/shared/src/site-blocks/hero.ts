/**
 * Hero block — PM-authored welcome panel with headline, optional subtitle,
 * optional CTA, optional hero image (with required alt text).
 *
 * Rendered first on every public site; carries the strongest visual weight.
 */
import { z } from 'zod';
import { altTextSchema, ctaTargetSchema, imagePathSchema } from './types';

export const heroBlockSchema = z
  .object({
    headline: z.string().min(1).max(120),
    subtitle: z.string().min(1).max(280).optional(),
    ctaText: z.string().min(1).max(40).optional(),
    ctaTarget: ctaTargetSchema.optional(),
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
  );

export type HeroBlockContent = z.infer<typeof heroBlockSchema>;
