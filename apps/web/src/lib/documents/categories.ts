import { normalizeCategoryName } from '@propertypro/shared';

export interface DocumentCategoryOption {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isSystem?: boolean;
}

export function toCategorySlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function resolveDocumentCategoryId(
  categories: DocumentCategoryOption[],
  categoryName: string | null | undefined,
): number | null {
  if (!categoryName) {
    return null;
  }

  const normalizedSlug = toCategorySlug(categoryName);
  const exactSlugMatches = categories.filter((category) => category.slug === normalizedSlug);
  if (exactSlugMatches.length === 1) {
    return exactSlugMatches[0]!.id;
  }

  const exactNameMatches = categories.filter(
    (category) => category.name.trim().toLowerCase() === categoryName.trim().toLowerCase(),
  );
  if (exactNameMatches.length === 1) {
    return exactNameMatches[0]!.id;
  }

  const normalizedKey = normalizeCategoryName(categoryName);
  if (normalizedKey === 'unknown') {
    return null;
  }

  const normalizedMatches = categories.filter(
    (category) => normalizeCategoryName(category.name) === normalizedKey,
  );

  return normalizedMatches.length === 1 ? normalizedMatches[0]!.id : null;
}
