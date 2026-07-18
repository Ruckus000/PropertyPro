'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * Cancellation: pairs an `AbortController` with the helper's `signal` option.
 * If `communityId` changes mid-walk (or the component unmounts), the in-
 * flight request is cancelled at the network layer rather than discarded
 * client-side.
 */
type CategoryItem =
  Infer<typeof documentCategoriesListContract>['data'][number];

export function useDocumentCategories(communityId: number) {
  const [categories, setCategories] = useState<DocumentCategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const collected = await walkPaginated<CategoryItem>(
          '/api/v1/document-categories',
          { communityId: String(communityId) },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setCategories(collected);
      } catch (loadError) {
        if (controller.signal.aborted) return; // expected on unmount / id change
        setCategories([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load document categories');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, [communityId]);

  const resolveCategoryId = useCallback(
    (categoryName: string | null | undefined) => resolveDocumentCategoryId(categories, categoryName),
    [categories],
  );

  return {
    categories,
    isLoading,
    error,
    resolveCategoryId,
  };
}
