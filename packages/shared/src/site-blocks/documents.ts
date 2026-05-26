/**
 * Documents SoR block — configuration only. The renderer reads from the
 * documents table at render time, filtered to public_access=true.
 */
import { z } from 'zod';
import { sorLimitSchema } from './types';

const documentCategorySchema = z.enum([
  'budget',
  'minutes',
  'financial',
  'rules',
  'other',
]);

export const documentsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    includeCategories: z.array(documentCategorySchema).optional(),
  })
  .strict();

export type DocumentsBlockContent = z.infer<typeof documentsBlockSchema>;
