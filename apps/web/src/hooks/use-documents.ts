'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { DocumentListItem } from '@/components/documents/document-list';

/**
 * TanStack-Query hooks for the documents API. Replaces the previous
 * pattern in `document-list.tsx` of `useState + useEffect + fetch` and a
 * `refreshKey` counter passed down from the library to bust the cache —
 * `useQueryClient().invalidateQueries({ queryKey: documentsKey(...) })`
 * after upload achieves the same thing without prop drilling.
 */

export const documentsKey = (communityId: number, categoryId: number | null | undefined) =>
  ['documents', communityId, categoryId ?? 'all'] as const;

interface UseDocumentsOptions {
  communityId: number;
  categoryId?: number | null;
  enabled?: boolean;
}

export function useDocuments({ communityId, categoryId, enabled = true }: UseDocumentsOptions) {
  return useQuery({
    queryKey: documentsKey(communityId, categoryId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (categoryId != null) params.set('categoryId', String(categoryId));
      return requestJson<DocumentListItem[]>(`/api/v1/documents?${params.toString()}`);
    },
    enabled: enabled && communityId > 0,
  });
}

export function useDeleteDocument(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: number }) => {
      // The DELETE endpoint reads id+communityId from query string, not body.
      const params = new URLSearchParams({
        id: String(payload.id),
        communityId: String(communityId),
      });
      return requestJson<{ id: number }>(`/api/v1/documents?${params.toString()}`, {
        method: 'DELETE',
      });
    },
    onSuccess: async () => {
      // Invalidate every category-slice for this community — a delete in the
      // active filter affects "all", and the deleted row's own category may
      // not match the currently-shown filter.
      await queryClient.invalidateQueries({ queryKey: ['documents', communityId] });
    },
  });
}
