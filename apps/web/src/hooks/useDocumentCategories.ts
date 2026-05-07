'use client';

import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '@/lib/api/request-json';
import {
  resolveDocumentCategoryId,
  type DocumentCategoryOption,
} from '@/lib/documents/categories';

interface CategoriesPage {
  data: DocumentCategoryOption[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Loads every document category for a community, walking the cursor-based
 * pagination contract (Plan B3 pilot). The consumer needs the full list to
 * resolve a category by name, so we keep fetching until `hasMore` is false.
 *
 * In practice document_categories tables hold ~10–30 rows per community, so
 * the walk almost always completes in a single request (default page size 50).
 * The loop is a safety net for atypically large tables — and a simple guard
 * against runaway pagination.
 */
const MAX_PAGES = 20; // 20 × 100 = 2000 categories — well above any realistic ceiling.

export function useDocumentCategories(communityId: number) {
  const [categories, setCategories] = useState<DocumentCategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCategories(): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const collected: DocumentCategoryOption[] = [];
        let cursor: string | null = null;
        for (let i = 0; i < MAX_PAGES; i++) {
          // Bail early if communityId changed or the component unmounted
          // while a previous page was in flight — avoids issuing dependent
          // requests whose result we'd discard.
          if (!active) return;
          const params = new URLSearchParams({ communityId: String(communityId) });
          if (cursor) params.set('cursor', cursor);
          const page = await requestJson<CategoriesPage>(
            `/api/v1/document-categories?${params.toString()}`,
          );
          collected.push(...page.data);
          if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
          cursor = page.pagination.nextCursor;
        }

        if (active) {
          setCategories(collected);
        }
      } catch (loadError) {
        if (active) {
          setCategories([]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load document categories');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadCategories();

    return () => {
      active = false;
    };
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
