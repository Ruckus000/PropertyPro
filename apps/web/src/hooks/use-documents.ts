'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type { DocumentRow } from '@/lib/documents/document-state';

/**
 * TanStack-Query hooks for the documents API. Replaces the previous
 * pattern in `document-list.tsx` of `useState + useEffect + fetch` and a
 * `refreshKey` counter passed down from the library to bust the cache —
 * `useQueryClient().invalidateQueries({ queryKey: documentsKey(...) })`
 * after upload achieves the same thing without prop drilling.
 */

export const documentsKey = (communityId: number, categoryId: number | null | undefined) =>
  ['documents', communityId, categoryId ?? 'all'] as const;

export const documentDownloadKey = (communityId: number, documentId: number | null | undefined) =>
  ['document-download', communityId, documentId ?? 'none'] as const;

export const documentVersionsKey = (communityId: number, documentId: number | null | undefined) =>
  ['document-versions', communityId, documentId ?? 'none'] as const;

const DOCUMENT_DOWNLOAD_FALLBACK_ERROR = 'Unable to load document preview';
const MAX_SURFACED_DOWNLOAD_ERROR_LENGTH = 200;

interface UseDocumentsOptions {
  communityId: number;
  categoryId?: number | null;
  enabled?: boolean;
}

interface UseDocumentDownloadUrlOptions {
  communityId: number;
  documentId: number | null;
  enabled?: boolean;
}

export interface DocumentVersionItem {
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: string | null;
}

interface UseDocumentVersionsOptions {
  communityId: number;
  documentId: number | null;
  enabled?: boolean;
}

interface DocumentDownloadResponse {
  url: string;
  fileName?: string;
}

function normalizeDownloadError(error: unknown): Error {
  if (error instanceof SyntaxError) {
    return new Error(DOCUMENT_DOWNLOAD_FALLBACK_ERROR);
  }

  const message = error instanceof Error ? error.message.trim() : '';
  if (
    message.length > 0
    && message.length <= MAX_SURFACED_DOWNLOAD_ERROR_LENGTH
    && message !== 'Missing response payload'
  ) {
    return new Error(message);
  }
  return new Error(DOCUMENT_DOWNLOAD_FALLBACK_ERROR);
}

function fetchDocuments(
  communityId: number,
  categoryId: number | null | undefined,
  signal?: AbortSignal,
): Promise<DocumentRow[]> {
  const baseParams: Record<string, string> = {
    communityId: String(communityId),
  };
  if (categoryId != null) baseParams.categoryId = String(categoryId);
  return walkPaginated<DocumentRow>('/api/v1/documents', baseParams, { signal });
}

export function useDocuments({ communityId, categoryId, enabled = true }: UseDocumentsOptions) {
  return useQuery({
    // Keep showing the previous page while a filter/page change refetches.
    placeholderData: keepPreviousData,
    queryKey: documentsKey(communityId, categoryId),
    queryFn: ({ signal }) => fetchDocuments(communityId, categoryId, signal),
    enabled: enabled && communityId > 0,
  });
}

/**
 * Warm the default (all-categories) documents list ahead of navigation —
 * wired to sidebar hover/focus via `prefetchNavData`. Uses the same key and
 * fetcher as `useDocuments`, so the page mounts against a warm cache.
 */
export function prefetchDocuments(queryClient: QueryClient, communityId: number): Promise<void> {
  if (communityId <= 0) {
    return Promise.resolve();
  }
  return queryClient.prefetchQuery({
    queryKey: documentsKey(communityId, undefined),
    queryFn: ({ signal }) => fetchDocuments(communityId, undefined, signal),
  });
}

export function useDocumentDownloadUrl({
  communityId,
  documentId,
  enabled = true,
}: UseDocumentDownloadUrlOptions) {
  return useQuery({
    queryKey: documentDownloadKey(communityId, documentId),
    queryFn: async ({ signal }) => {
      try {
        const data = await requestJson<DocumentDownloadResponse>(
          `/api/v1/documents/${documentId}/download?communityId=${communityId}`,
          { signal },
        );
        if (!data.url) {
          throw new Error(DOCUMENT_DOWNLOAD_FALLBACK_ERROR);
        }
        return data;
      } catch (error) {
        throw normalizeDownloadError(error);
      }
    },
    enabled: enabled && communityId > 0 && documentId != null,
    retry: 0,
  });
}

export function useDocumentVersions({
  communityId,
  documentId,
  enabled = true,
}: UseDocumentVersionsOptions) {
  return useQuery({
    queryKey: documentVersionsKey(communityId, documentId),
    queryFn: ({ signal }) =>
      requestJson<DocumentVersionItem[]>(
        `/api/v1/documents/${documentId}/versions?communityId=${communityId}`,
        { signal },
      ),
    enabled: enabled && communityId > 0 && documentId != null && documentId > 0,
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

/**
 * Invalidate the documents cache after an out-of-band write (an upload).
 * Moved here from `document-list-container.tsx` when that container was
 * replaced — it is a query-cache concern, not a list-rendering one.
 */
export function useDocumentsInvalidator(communityId: number) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['documents', communityId] });
  }, [queryClient, communityId]);
}
