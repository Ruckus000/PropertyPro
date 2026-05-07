'use client';

/**
 * DocumentListContainer — feature-container pattern (B5).
 *
 * Owns:
 *   - Data fetch (`useDocuments`) and delete mutation (`useDeleteDocument`).
 *   - The native confirm() prompt before deletion.
 *   - Download URL composition.
 *   - Tracking which document's delete request is currently in flight (so
 *     the presenter can show a per-row spinner) — via `useMutation.variables`.
 *
 * Hands a pure-prop `<DocumentList />` everything it needs to render.
 *
 * Replaces the previous `useState + useEffect + fetch + refreshKey` pattern
 * with TanStack Query. Cache invalidation after upload now happens via
 * `useQueryClient().invalidateQueries({ queryKey: ['documents', communityId] })`
 * (see `useDocumentsInvalidator` below for the helper used by the library).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DocumentList, type DocumentListItem } from './document-list';
import { useDeleteDocument, useDocuments } from '@/hooks/use-documents';

interface DocumentListContainerProps {
  communityId: number;
  categoryId?: number | null;
  canManage: boolean;
  onSelectDocument?: (document: DocumentListItem) => void;
  /** Optional: notify parent of a deletion (e.g. close an open viewer for the deleted doc). */
  onDeleteDocument?: (document: DocumentListItem) => void;
  onUploadRequest?: () => void;
}

export function DocumentListContainer({
  communityId,
  categoryId,
  canManage,
  onSelectDocument,
  onDeleteDocument,
  onUploadRequest,
}: DocumentListContainerProps) {
  const query = useDocuments({ communityId, categoryId });
  const deleteMutation = useDeleteDocument(communityId);

  const documents = query.data ?? [];
  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : deleteMutation.error instanceof Error
        ? deleteMutation.error.message
        : null;

  // `mutation.variables` holds the in-flight payload — null when idle.
  const deletingId = deleteMutation.isPending ? deleteMutation.variables?.id ?? null : null;

  const handleDelete = useCallback(
    async (doc: DocumentListItem) => {
      if (!canManage) return;
      // Native confirm() preserves prior behavior. A future PR could replace
      // this with the shared AlertDialog used by announcement-list.
      if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete "${doc.title}"?`)) {
        return;
      }
      try {
        await deleteMutation.mutateAsync({ id: doc.id });
        onDeleteDocument?.(doc);
      } catch {
        // error surfaced via errorMessage above
      }
    },
    [canManage, deleteMutation, onDeleteDocument],
  );

  const handleDownload = useCallback(
    (doc: DocumentListItem) => {
      window.open(
        `/api/v1/documents/${doc.id}/download?communityId=${communityId}&attachment=true`,
        '_blank',
      );
    },
    [communityId],
  );

  return (
    <DocumentList
      documents={documents}
      isLoading={query.isLoading}
      errorMessage={errorMessage}
      deletingId={deletingId}
      canManage={canManage}
      onSelectDocument={onSelectDocument}
      onDeleteDocument={handleDelete}
      onDownloadDocument={handleDownload}
      onUploadRequest={onUploadRequest}
    />
  );
}

/**
 * Helper for parents that need to invalidate the documents cache after an
 * out-of-band write (e.g. upload). Replaces the legacy `refreshKey++` prop
 * drilling pattern.
 */
export function useDocumentsInvalidator(communityId: number) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['documents', communityId] });
  }, [queryClient, communityId]);
}
