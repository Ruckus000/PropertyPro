/**
 * Block type primitives — shared Zod fragments + the BlockType union.
 *
 * Each block type's content schema lives in its own file in this directory
 * (e.g., ./hero.ts). The registry at ./index.ts wires them together.
 */
import { z } from 'zod';

/**
 * All supported block types. The first 7 are v1 (Essentials+); `faq`,
 * `gallery` and `amenities` are the Pro+ "polish blocks" added in PR #10,
 * gated to the `hasSitePolishBlocks` plan feature at the write path;
 * `payments` was added in website-editor-v3 Phase 9.
 *
 * This list is duplicated, without a compile-time link, in the
 * `site_blocks_block_type_check` CHECK constraint (migration 0044) and in the
 * upsert contract's z.enum. Adding a type means touching all three.
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
  'payments',
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

/**
 * Layout variants for the authored blocks (text, image, amenities).
 *
 * Named `variant`, NOT `layout`: `BlockRendererProps.layout` is already the
 * site-wide template id (tidewater / boulevard / sable), and two different
 * `layout`s in one component body is a bug waiting to be written.
 *
 * `standard` is the shape every block rendered before this field existed, so
 * an absent value and an explicit `standard` mean the same thing. Renderers
 * treat `undefined` as `standard` rather than requiring a backfill.
 */
export const BLOCK_VARIANTS = ['standard', 'wide', 'compact'] as const;
export type BlockVariant = (typeof BLOCK_VARIANTS)[number];
export const blockVariantSchema = z.enum(BLOCK_VARIANTS);

/**
 * Hidden from visitors while kept in the editor — for seasonal sections a PM
 * wants back later.
 *
 * `z.literal(true)` not `z.boolean()`: absence is the only way to say "visible",
 * so there is exactly one representation of each state and no `hidden: false`
 * rows to reason about. Same shape as `imageBlockSchema.decorative`.
 *
 * NOT on `heroBlockSchema` — the hero is the welcome region, and a site whose
 * first screen is missing reads as broken rather than as edited.
 *
 * This is CONTENT, so it drafts and publishes like any other edit; the
 * draft/tombstone machinery is untouched.
 */
export const hiddenSchema = z.literal(true);

/**
 * PM-authored replacement for a system-of-record block's built-in empty copy.
 *
 * Only meaningful on blocks that CAN render empty — the SoR types, whose rows
 * arrive as props and are legitimately sometimes zero. The authored blocks
 * cannot be empty by construction (`textBlockSchema.body` is `min(1)`,
 * `imageBlockSchema.imagePath` is required, `amenitiesBlockSchema.items` is
 * `min(1)`), so this field is deliberately not on them.
 *
 * `contact` is excluded for the same reason: it renders fields, not a list, so
 * it has no zero-rows branch to override.
 */
export const emptyTextSchema = z.string().min(1).max(200);
