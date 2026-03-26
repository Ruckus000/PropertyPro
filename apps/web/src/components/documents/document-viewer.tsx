'use client';

import { useCallback, useEffect, useState } from 'react';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import { AlertBanner } from '@/components/shared/alert-banner';
import {
  isImageMimeType,
  isPdfMimeType,
  isPreviewableMimeType,
  loadDocumentPreview,
  type DocumentPreviewResult,
} from '@/lib/documents/document-preview-loader';
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
  const [preview, setPreview] = useState<DocumentPreviewResult>({ state: 'idle' });
  const [currentPage, setCurrentPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  const downloadHref = document
    ? `/api/v1/documents/${document.id}/download?communityId=${communityId}&attachment=true`
    : '#';
  const canPreview = document ? isPreviewableMimeType(document.mimeType) : false;
  const isPdf = document ? isPdfMimeType(document.mimeType) : false;
  const isImage = document ? isImageMimeType(document.mimeType) : false;
  const showDownloadAction = Boolean(document) && (!canPreview || preview.state === 'ready');

  const retryPreview = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!document) {
      setPreview({ state: 'idle' });
      return;
    }

    if (!isPreviewableMimeType(document.mimeType)) {
      setPreview({ state: 'unsupported_type' });
      return;
    }

    let cancelled = false;
    setPreview({ state: 'loading' });

    void loadDocumentPreview(document.id, communityId, document.mimeType)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview({
            state: 'storage_unavailable',
            message: err instanceof Error
              ? err.message
              : 'We could not load the document preview.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document, communityId, reloadToken]);

  useEffect(() => {
    if (!document) {
      return;
    }

    setCurrentPage(0);
  }, [document?.id]);

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
          {showDownloadAction && (
            <a
              href={downloadHref}
              className="rounded-md bg-interactive px-3 py-1.5 text-sm font-medium text-white hover:bg-interactive-hover"
            >
              Download
            </a>
          )}
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
        {preview.state === 'loading' && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
          </div>
        )}

        {preview.state === 'file_missing' && (
          <div className="flex h-full flex-col justify-center">
            <AlertBanner
              status="warning"
              title="Preview unavailable"
              description="This document record exists, but the backing file is missing from storage. Re-upload the file if you need it restored."
            />
          </div>
        )}

        {preview.state === 'storage_unavailable' && (
          <div className="flex h-full flex-col justify-center">
            <AlertBanner
              status="warning"
              title="Preview unavailable"
              description={preview.message}
              action={(
                <button
                  type="button"
                  onClick={retryPreview}
                  className="rounded-md border border-status-warning px-3 py-1.5 text-sm font-medium"
                >
                  Retry
                </button>
              )}
            />
          </div>
        )}

        {preview.state === 'ready' && (
          <>
            {isPdf && (
              <div className="h-full">
                <PdfViewer
                  pdfUrl={preview.url}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onDocumentLoad={({ totalPages }) => {
                    setCurrentPage((page) => Math.min(page, Math.max(totalPages - 1, 0)));
                  }}
                  scale={1}
                />
              </div>
            )}
            {isImage && (
              <div className="flex h-full items-center justify-center">
                <img
                  src={preview.url}
                  alt={document.title}
                  className="max-h-full max-w-full object-contain"
                  onError={() => {
                    setPreview({
                      state: 'storage_unavailable',
                      message: 'We could not load the image preview. Please try again.',
                    });
                  }}
                />
              </div>
            )}
          </>
        )}

        {preview.state === 'unsupported_type' && (
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
