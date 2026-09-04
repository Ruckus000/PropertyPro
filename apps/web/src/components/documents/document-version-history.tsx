'use client';

import { useState } from 'react';
import type { DocumentRow } from '@/lib/documents/document-state';
import { DocumentViewerModal } from './DocumentViewerModal';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentVersions, type DocumentVersionItem } from '@/hooks/use-documents';
import { formatBytes } from '@/lib/utils/format-bytes';

interface DocumentVersionHistoryProps {
  communityId: number;
  document: DocumentRow;
  onClose?: () => void;
  onSelectVersion?: (version: DocumentVersionItem) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentVersionHistory({
  communityId,
  document,
  onClose,
  onSelectVersion,
}: DocumentVersionHistoryProps) {
  const [viewerDocument, setViewerDocument] = useState<{ id: number; fileName: string } | null>(null);

  function isPreviewable(mimeType: string): boolean {
    // Exclude image/svg+xml — SVGs can carry script payloads.
    if (mimeType === 'image/svg+xml') return false;
    return mimeType.includes('pdf') || mimeType.includes('image');
  }

  const versionsQuery = useDocumentVersions({ communityId, documentId: document.id });
  const versions = versionsQuery.data ?? [];
  const isLoading = versionsQuery.isPending;
  const error = versionsQuery.isError ? 'Failed to load version history' : null;

  return (
    <div className="flex h-full flex-col rounded-md border border-edge bg-surface-card">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div>
          <h3 className="font-medium text-content">Version History</h3>
          <p className="text-sm text-content-tertiary">{document.title}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-content-tertiary hover:bg-surface-muted hover:text-content-secondary"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="border-b border-status-warning-border bg-status-warning-bg px-4 py-2">
        <p className="text-xs text-status-warning">
          <strong>Note:</strong> Grouped by same document title and category; this is not an explicit revision chain.
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="divide-y divide-edge" data-testid="document-version-history-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-4">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-content-secondary">No other versions found</p>
            <p className="text-xs text-content-tertiary">
              This is the only document with this title and category
            </p>
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <div className="divide-y divide-edge">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={`flex items-center justify-between p-4 ${
                  version.id === document.id ? 'bg-interactive-subtle' : 'hover:bg-surface-hover'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-content">
                      {version.id === document.id ? 'Current Version' : `Version ${versions.length - index}`}
                    </p>
                    {version.id === document.id && (
                      <span className="rounded-full bg-interactive-subtle px-2 py-0.5 text-xs font-medium text-interactive">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-content-tertiary">
                    {version.fileName} &middot; {formatBytes(version.fileSize)}
                  </p>
                  <p className="text-xs text-content-disabled">{formatDate(version.createdAt)}</p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  {version.id !== document.id && onSelectVersion && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isPreviewable(version.mimeType)) {
                          setViewerDocument({ id: version.id, fileName: version.fileName });
                          return;
                        }
                        onSelectVersion(version);
                      }}
                      className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                    >
                      View
                    </button>
                  )}
                  <a
                    href={`/api/v1/documents/${version.id}/download?communityId=${communityId}&attachment=true`}
                    className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <DocumentViewerModal
        open={viewerDocument != null}
        onOpenChange={(open) => {
          if (!open) {
            setViewerDocument(null);
          }
        }}
        communityId={communityId}
        documentId={viewerDocument?.id ?? null}
        fileName={viewerDocument?.fileName}
      />
    </div>
  );
}
