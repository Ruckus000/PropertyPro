/**
 * Documents SoR block — configuration only. The renderer reads from the
 * documents table at render time, filtered to public_access=true.
 */
import { z } from 'zod';
import { emptyTextSchema, sorLimitSchema } from './types';

/**
 * The closed set of document categories a documents block may filter to.
 * Single source of truth — consumed by the schema below AND by editor UIs
 * (e.g. the admin starter-pack block editor) so they can't drift.
 */
export const DOCUMENT_CATEGORIES = [
  'budget',
  'minutes',
  'financial',
  'rules',
  'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export const documentsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    includeCategories: z.array(documentCategorySchema).optional(),
    /** Replaces the renderer's built-in empty copy when there are no rows. */
    emptyText: emptyTextSchema.optional(),
  })
  .strict();

export type DocumentsBlockContent = z.infer<typeof documentsBlockSchema>;
