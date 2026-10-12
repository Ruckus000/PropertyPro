'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Infer } from '@propertypro/api-contract';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type { documentCategoriesListContract } from
  '@/app/api/v1/document-categories/contract';
import {
  resolveDocumentCategoryId,
  type DocumentCategoryOption,
} from '@/lib/documents/categories';

/**
 * Loads every document category for a community via the canonical
 * `walkPaginated()` helper (Plan B3). The consumer needs the full list to
 * resolve a category by name, so the helper walks pages until `hasMore` is
 * false.
 *
 * The item shape is derived from the route contract (Plan A1 pilot) so the
 * hook stays in lockstep with the route's declared response schema — no
 * duplicated interface.
 *
 * A React Query query, so the seven components that read the list share one
 * cached copy. It was a per-component `useEffect` fetch: opening one document
 * on the Documents page sent four identical walks of this endpoint, each
 * paying API auth and membership, and every visit refetched from scratch.
 * React Query passes the walk an abort `signal`, so a `communityId` change or
 * an unmount still cancels the request at the network layer.
 */
type CategoryItem =
  Infer<typeof documentCategoriesListContract>['data'][number];

const NO_CATEGORIES: DocumentCategoryOption[] = [];

export function useDocumentCategories(communityId: number) {
  const query = useQuery<DocumentCategoryOption[]>({
    queryKey: ['document-categories', communityId],
    queryFn: ({ signal }) =>
      walkPaginated<CategoryItem>(
        '/api/v1/document-categories',
        { communityId: String(communityId) },
        { signal },
      ),
    // One attempt, as before: consumers show the error straight away.
    retry: false,
  });
  const categories = query.data ?? NO_CATEGORIES;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : 'Failed to load document categories'
    : null;

  const resolveCategoryId = useCallback(
    (categoryName: string | null | undefined) => resolveDocumentCategoryId(categories, categoryName),
    [categories],
  );

  return {
    categories,
    isLoading: query.isPending,
    error,
    resolveCategoryId,
  };
}
