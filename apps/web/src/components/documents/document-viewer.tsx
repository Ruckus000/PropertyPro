'use client';

import { useState, useEffect } from 'react';
import type { DocumentListItem } from './document-list';

interface DocumentViewerProps {
  communityId: number;
  document: DocumentListItem | null;
  onClose?: () => void;
  onViewVersions?: (document: DocumentListItem) => void;
}

export function DocumentViewer({
  communityId,
  document,
  onClose,
  onViewVersions,
}: DocumentViewerProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document) {
      setDownloadUrl(null);
      return;
    }

    const isPdf = document.mimeType.includes('pdf');
    const isImage = document.mimeType.includes('image');

    if (!isPdf && !isImage) {
      setDownloadUrl(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(`/api/v1/documents/${document.id}/download?communityId=${communityId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load document');
        return res.json();
      })
      .then((json: { data: { url: string } }) => {
        setDownloadUrl(json.data.url);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [document, communityId]);

  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-md border border-edge bg-surface-page p-8">
        <svg
          className="h-16 w-16 text-content-disabled"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-4 text-sm text-content-tertiary">
          Select a document to preview
        </p>
      </div>
    );
  }

  const isPdf = document.mimeType.includes('pdf');
  const isImage = document.mimeType.includes('image');
  const canPreview = isPdf || isImage;

  return (
    <div className="flex h-full flex-col rounded-md border border-edge bg-surface-card">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-content">{document.title}</h3>
          <p className="text-sm text-content-tertiary">{document.fileName}</p>
        </div>
        <div className="ml-4 flex items-center gap-2">
          {onViewVersions && (
            <button
              type="button"
              onClick={() => onViewVersions(document)}
              className="rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
            >
              Version History
            </button>
          )}
          <a
            href={`/api/v1/documents/${document.id}/download?communityId=${communityId}&attachment=true`}
            className="rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-white hover:bg-interactive-hover"
          >
            Download
          </a>
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
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        )}

        {!isLoading && !error && canPreview && downloadUrl && (
          <>
            {isPdf && (
              <iframe
                src={downloadUrl}
                className="h-full w-full rounded border border-edge"
                title={document.title}
              />
            )}
            {isImage && (
              <div className="flex h-full items-center justify-center">
                <img
                  src={downloadUrl}
                  alt={document.title}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
          </>
        )}

        {!isLoading && !error && !canPreview && (
          <div className="flex h-full flex-col items-center justify-center">
            <svg
              className="h-16 w-16 text-content-disabled"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="mt-4 text-sm text-content-secondary">
              Preview not available for this file type
            </p>
            <p className="text-xs text-content-tertiary">
              Download the file to view its contents
            </p>
          </div>
        )}
      </div>

      {document.description && (
        <div className="border-t border-edge px-4 py-3">
          <p className="text-sm text-content-secondary">{document.description}</p>
        </div>
      )}
    </div>
  );
}
