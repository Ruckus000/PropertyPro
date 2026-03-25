'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resolveDocumentCategoryId,
  type DocumentCategoryOption,
} from '@/lib/documents/categories';

interface CategoriesResponse {
  data: DocumentCategoryOption[];
}

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
        const response = await fetch(`/api/v1/document-categories?communityId=${communityId}`);
        if (!response.ok) {
          throw new Error('Failed to load document categories');
        }

        const body = (await response.json()) as CategoriesResponse;
        if (active) {
          setCategories(body.data ?? []);
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

    loadCategories();

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
