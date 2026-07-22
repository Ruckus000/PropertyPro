/**
 * Block type primitives — shared Zod fragments + the BlockType union.
 *
 * Each block type's content schema lives in its own file in this directory
 * (e.g., ./hero.ts). The registry at ./index.ts wires them together.
 */
import { z } from 'zod';

/**
 * All supported block types. The first 7 are v1 (Essentials+); the final 3
 * (`faq`, `gallery`, `amenities`) are the Pro+ "polish blocks" added in PR #10,
 * gated to the `hasSitePolishBlocks` plan feature at the write path.
 */
export const BLOCK_TYPES = [
  'hero',
  'text',
  'image',
  'documents',
  'meetings',
  'announcements',
  'contact',
  'faq',
  'gallery',
  'amenities',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/**
 * Sentinel block type for a staged deletion: a draft row of this type marks
 * "remove the published block at this order on next publish". Deliberately
 * NOT part of BLOCK_TYPES / blockTypeSchema / blockSchemaRegistry — PMs can
 * never write one through the upsert contract, only via the DELETE endpoint,
 * and tombstones are never promoted to published (publishCommunitySite
 * retires them). Renderers and the editor filter rows of this type out.
 */
export const TOMBSTONE_BLOCK_TYPE = 'tombstone' as const;

/**
 * Supabase Storage path for site assets.
 *
 * Path shape: {community_id}/{kind}/{safe-filename}
 * Refused: traversal segments ('..'), absolute paths, schemes, leading slashes.
 */
export const imagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\d+\/(logo|hero|content)\/[a-zA-Z0-9._/-]+$/, {
    message: 'Must be a path under {community_id}/{kind}/...',
  })
  .refine(
    (v) => !v.split('/').includes('..'),
    'Path traversal segments (..) are not allowed.',
  );

/** Alt text — required for non-decorative images. */
export const altTextSchema = z.string().min(1).max(200);

/** Common CTA target — internal path or external URL (https only). */
export const ctaTargetSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) => {
      // Browsers normalize backslashes to forward slashes when resolving a
      // URL, so "/\evil.com", "/\/\evil.com", and "\\evil.com" all behave like
      // the protocol-relative "//evil.com" and would open-redirect off-site.
      // Normalize first, then reject anything that resolves protocol-relative.
      const normalized = v.replace(/\\/g, '/');
      if (normalized.startsWith('//')) return false;
      return v.startsWith('/') || v.startsWith('https://');
    },
    'CTA target must be an internal path (starting with /, not // or a backslash variant) or an https URL',
  );

/** SoR block configuration limits used across documents/meetings/announcements. */
export const sorLimitSchema = z.number().int().min(1).max(20);
