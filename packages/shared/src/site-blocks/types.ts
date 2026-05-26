/**
 * Block type primitives — shared Zod fragments + the BlockType union.
 *
 * Each block type's content schema lives in its own file in this directory
 * (e.g., ./hero.ts). The registry at ./index.ts wires them together.
 */
import { z } from 'zod';

/** The 7 v1 block types. PR #10 adds 'faq' | 'gallery' | 'amenities'. */
export const BLOCK_TYPES = [
  'hero',
  'text',
  'image',
  'documents',
  'meetings',
  'announcements',
  'contact',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/** Supabase Storage path for site assets. */
export const imagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\d+\/(logo|hero|content)\/[a-zA-Z0-9._/-]+$/, {
    message: 'Must be a path under {community_id}/{kind}/...',
  });

/** Alt text — required for non-decorative images. */
export const altTextSchema = z.string().min(1).max(200);

/** Common CTA target — internal path or external URL (https only). */
export const ctaTargetSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) => v.startsWith('/') || v.startsWith('https://'),
    'CTA target must be an internal path (starting with /) or an https URL',
  );

/** SoR block configuration limits used across documents/meetings/announcements. */
export const sorLimitSchema = z.number().int().min(1).max(20);
