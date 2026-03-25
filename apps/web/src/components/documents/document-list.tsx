'use client';

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';

export type ExtractionStatus = 'pending' | 'completed' | 'failed' | 'not_applicable' | 'skipped';

export interface DocumentListItem {
  id: number;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  categoryId: number | null;
  createdAt: string;
  uploadedBy: string | null;
  extractionStatus?: ExtractionStatus | null;
}

interface DocumentListResponse {
  data: DocumentListItem[];
}

interface DocumentListProps {
  communityId: number;
  categoryId?: number | null;
  onSelectDocument?: (document: DocumentListItem) => void;
  onDeleteDocument?: (document: DocumentListItem) => void;
  onUploadRequest?: () => void;
  refreshKey?: number;
  canManage?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getMimeIcon(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
  if (mimeType.includes('image')) return 'IMG';
  return 'FILE';
}

const EXTRACTION_BADGE_CONFIG: Record<string, { label: string; className: string } | null> = {
  completed: {
    label: 'Searchable',
    className: 'bg-status-success-bg text-status-success',
  },
  pending: {
    label: 'Processing',
    className: 'bg-status-warning-bg text-status-warning',
  },
  failed: {
    label: 'Search unavailable',
    className: 'bg-status-danger-bg text-status-danger',
  },
  skipped: {
    label: 'Not searchable',
    className: 'bg-surface-muted text-content-secondary',
  },
  not_applicable: null,
};

export function ExtractionStatusBadge({ status }: { status?: ExtractionStatus | null }) {
  // Backward compatible: null/undefined extractionStatus treated as not_applicable
  if (status == null || status === 'not_applicable') return null;

  const config = EXTRACTION_BADGE_CONFIG[status];
  if (!config) return null;

  return (
    <span
      data-testid="extraction-badge"
      data-extraction-status={status}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export function DocumentList({
  communityId,
  categoryId,
  onSelectDocument,
  onDeleteDocument,
  onUploadRequest,
  refreshKey = 0,
  canManage = false,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchDocuments = useCallback(() => {
    startTransition(async () => {
      try {
        setError(null);
        const params = new URLSearchParams({
          communityId: String(communityId),
        });
        if (categoryId != null) {
          params.set('categoryId', String(categoryId));
        }

        const res = await fetch(`/api/v1/documents?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load documents (${res.status})`);
        }

        const json = (await res.json()) as DocumentListResponse;
        setDocuments(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      }
    });
  }, [communityId, categoryId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

  const handleDelete = async (doc: DocumentListItem) => {
    if (!canManage) {
      return;
    }
    if (!confirm(`Are you sure you want to delete "${doc.title}"?`)) {
      return;
    }

    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/v1/documents?id=${doc.id}&communityId=${communityId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete document');
      }

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      onDeleteDocument?.(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (doc: DocumentListItem) => {
    window.open(`/api/v1/documents/${doc.id}/download?communityId=${communityId}&attachment=true`, '_blank');
  };

  if (error) {
    return (
      <AlertBanner
        status="danger"
        title="Something went wrong"
        description={error}
      />
    );
  }

  if (isPending && documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
        <span className="ml-2 text-sm text-content-secondary">Loading documents...</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        preset="no_documents"
        action={
          canManage && onUploadRequest ? (
            <button
              type="button"
              onClick={onUploadRequest}
              className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
            >
              Upload Document
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="divide-y divide-edge rounded-md border border-edge">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-4 hover:bg-surface-hover"
        >
          <div
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
            onClick={() => onSelectDocument?.(doc)}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-muted text-xs font-medium text-content-secondary">
              {getMimeIcon(doc.mimeType)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-content">{doc.title}</p>
                <ExtractionStatusBadge status={doc.extractionStatus} />
              </div>
              <p className="truncate text-sm text-content-tertiary">
                {doc.fileName} &middot; {formatFileSize(doc.fileSize)} &middot;{' '}
                {formatDate(doc.createdAt)}
              </p>
            </div>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownload(doc)}
              className="rounded p-2 text-content-tertiary hover:bg-surface-muted hover:text-content-secondary"
              title="Download"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                disabled={deletingId === doc.id}
                className="rounded p-2 text-content-tertiary hover:bg-status-danger-bg hover:text-status-danger disabled:opacity-50"
                title="Delete"
              >
                {deletingId === doc.id ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-status-danger border-t-transparent" />
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
