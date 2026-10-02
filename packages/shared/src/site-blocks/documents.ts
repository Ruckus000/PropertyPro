/**
 * Documents SoR block — configuration only. The renderer reads from the
 * documents table at render time, filtered to public_access=true.
 */
import { z } from 'zod';
import { normalizeCategoryName } from '../access-policies';
import type { DocumentCategoryKey } from '../document-categories';
import { emptyTextSchema, hiddenSchema, sorLimitSchema } from './types';

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

/**
 * Which of a community's document categories each section category means.
 *
 * Communities name their categories ("Financial Records", "Meeting Records",
 * or whatever they renamed them to); a section stores one of the fixed values
 * above. The two used to be compared as strings, which matched nothing — so
 * every condo and HOA starter site's records section was born empty. They are
 * compared by MEANING now: a category's name goes through
 * `normalizeCategoryName`, the same normalizer the access rules use, and
 * `other` takes whatever the four named values don't.
 */
const SECTION_CATEGORY_KEYS: Record<Exclude<DocumentCategory, 'other'>, readonly DocumentCategoryKey[]> = {
  budget: ['financial_records'],
  financial: ['financial_records'],
  minutes: ['meeting_minutes'],
  rules: ['rules'],
};

const CLAIMED_KEYS = new Set<DocumentCategoryKey>(Object.values(SECTION_CATEGORY_KEYS).flat());

/** Whether a document in category `categoryName` belongs in a section filtered to `includeCategories`. */
export function documentMatchesSectionCategories(
  categoryName: string | null | undefined,
  includeCategories: readonly DocumentCategory[] | undefined,
): boolean {
  if (!includeCategories || includeCategories.length === 0) return false;
  // A document with no category has nothing to match — not even `other`. The
  // live reader filters by category id, so it could never show one either.
  if (categoryName == null) return false;
  const key = normalizeCategoryName(categoryName);
  return includeCategories.some((category) =>
    category === 'other' ? !CLAIMED_KEYS.has(key) : SECTION_CATEGORY_KEYS[category].includes(key),
  );
}

const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export const documentsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    includeCategories: z.array(documentCategorySchema).optional(),
    /** Replaces the renderer's built-in empty copy when there are no rows. */
    emptyText: emptyTextSchema.optional(),
    /** Hidden from visitors; still visible and editable in the editor. */
    hidden: hiddenSchema.optional(),
  })
  .strict();

export type DocumentsBlockContent = z.infer<typeof documentsBlockSchema>;
