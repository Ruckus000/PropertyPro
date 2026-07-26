/**
 * Starter-pack block-array validation. A starter pack's `blocks` jsonb is an
 * array of { blockType, blockOrder, content }. This module validates both the
 * array structure (orders, hero placement) and each block's content against
 * the matching block schema, returning a flat field-error list the admin
 * routes can echo in their { error: { message, fields } } envelope.
 *
 * NOTE: blockSchemaRegistry is imported from the sibling barrel and used only
 * inside validateStarterPackBlocks (call time), so the index ↔ starter-pack
 * import cycle resolves via ES-module live bindings — never reference it at
 * module-eval time here.
 */
import { z } from 'zod';
import { blockTypeSchema, type BlockType } from './types';
import { blockSchemaRegistry } from './index';
// Shared with the Phase 4 site validators so the admin-facing and PM-facing
// messages for the same malformed block cannot drift apart.
import { zodIssuesToFields } from '../site-diff/canonical';

export const starterPackBlockSchema = z
  .object({
    blockType: blockTypeSchema,
    blockOrder: z.number().int().min(1),
    content: z.unknown(),
  })
  .strict();

export const starterPackBlocksSchema = z
  .array(starterPackBlockSchema)
  .min(1)
  .superRefine((blocks, ctx) => {
    const seen = new Set<number>();
    blocks.forEach((b, i) => {
      if (seen.has(b.blockOrder)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: `Duplicate blockOrder ${b.blockOrder}` });
      }
      seen.add(b.blockOrder);
      if (b.blockType === 'hero' && b.blockOrder !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: 'The hero block must be at blockOrder 1' });
      }
      if (b.blockType !== 'hero' && b.blockOrder < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: 'Non-hero blocks must be at blockOrder 2 or higher' });
      }
    });
    if (blocks.filter((b) => b.blockType === 'hero').length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'At most one hero block is allowed' });
    }
  });

export interface StarterPackBlock {
  blockType: BlockType;
  blockOrder: number;
  content: unknown;
}

export interface StarterPackFieldError {
  field: string;
  message: string;
}

export type ValidateStarterPackBlocksResult =
  | { ok: true; data: StarterPackBlock[] }
  | { ok: false; fields: StarterPackFieldError[] };

export function validateStarterPackBlocks(blocks: unknown): ValidateStarterPackBlocksResult {
  const structural = starterPackBlocksSchema.safeParse(blocks);
  if (!structural.success) {
    return { ok: false, fields: zodIssuesToFields(structural.error) };
  }

  const fields: StarterPackFieldError[] = [];
  structural.data.forEach((block, i) => {
    const schema = blockSchemaRegistry[block.blockType];
    const parsed = schema.safeParse(block.content);
    if (!parsed.success) {
      fields.push(...zodIssuesToFields(parsed.error, `${i}.content`));
    }
  });
  if (fields.length > 0) return { ok: false, fields };

  return { ok: true, data: structural.data as StarterPackBlock[] };
}
