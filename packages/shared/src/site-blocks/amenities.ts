/**
 * Amenities block (Pro+) — a heading plus a list of community amenities,
 * each with a name and an optional one-line description.
 *
 * PM-authored marketing content (NOT the operational amenity-reservation
 * system). Plain text only — sanitization-free by construction.
 */
import { z } from 'zod';
import { blockVariantSchema, hiddenSchema } from './types';

export const amenityItemSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(280).optional(),
  })
  .strict();

export const amenitiesBlockSchema = z
  .object({
    heading: z.string().min(1).max(120).optional(),
    items: z.array(amenityItemSchema).min(1).max(30),
    /** Absent means `standard` — see blockVariantSchema. */
    variant: blockVariantSchema.optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type AmenityItem = z.infer<typeof amenityItemSchema>;
export type AmenitiesBlockContent = z.infer<typeof amenitiesBlockSchema>;
