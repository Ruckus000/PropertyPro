'use client';

import Link from 'next/link';
import { Maximize2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';
import {
  isImageMimeType,
  isPdfMimeType,
  isPreviewableMimeType,
  loadDocumentPreview,
  type DocumentPreviewResult,
} from '@/lib/documents/document-preview-loader';
import type { DocumentListItem } from './document-list';
import { DocumentViewerModal } from './DocumentViewerModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface DocumentViewerProps {
  communityId: number;
  document: DocumentListItem | null;
  onClose?: () => void;
  onViewVersions?: (document: DocumentListItem) => void;
  /** When true, an "Edit" CTA appears for authored documents that re-opens
   *  the in-app editor seeded from the published HTML. */
  canEditAuthored?: boolean;
}

export function DocumentViewer(props: DocumentViewerProps) {
  return (
    <ErrorBoundary>
      <DocumentViewerInner {...props} />
    </ErrorBoundary>
  );
}

function DocumentViewerInner({
  communityId,
  document,
  onClose,
  onViewVersions,
  canEditAuthored,
}: DocumentViewerProps) {
  const isAuthored = document?.sourceType === 'authored';
  const showEditAction = Boolean(canEditAuthored && isAuthored);
  const editHref = document
    ? `/communities/${communityId}/documents/author/new?source=${document.id}`
    : '#';
  const [preview, setPreview] = useState<DocumentPreviewResult>({ state: 'idle' });
  const [currentPage, setCurrentPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const downloadHref = document
    ? `/api/v1/documents/${document.id}/download?communityId=${communityId}&attachment=true`
    : '#';
  const canPreview = document ? isPreviewableMimeType(document.mimeType) : false;
  const isPdf = document ? isPdfMimeType(document.mimeType) : false;
  const isImage = document ? isImageMimeType(document.mimeType) : false;
  const showDownloadAction = Boolean(document) && (!canPreview || preview.state === 'ready');
  const documentTitle = document?.title ?? 'Document preview';

  function retryPreview() {
    setReloadToken((token) => token + 1);
  }

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
    setIsModalOpen(false);
  }, [document?.id]);

  function renderPreviewBody() {
    if (preview.state === 'loading') {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-interactive border-t-transparent" />
        </div>
      );
    }

    if (preview.state === 'file_missing') {
      return (
        <div className="flex h-full min-h-[320px] flex-col justify-center">
          <AlertBanner
            status="warning"
            title="Preview unavailable"
            description="This document record exists, but the backing file is missing from storage. Re-upload the file if you need it restored."
          />
        </div>
      );
    }

    if (preview.state === 'storage_unavailable') {
      return (
        <div className="flex h-full min-h-[320px] flex-col justify-center">
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
      );
    }

    if (preview.state === 'ready') {
      return (
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
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <img
                src={preview.url}
                alt={documentTitle}
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
      );
    }

    if (preview.state === 'unsupported_type') {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center">
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
      );
    }

    return null;
  }

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
    <>
      <div className="flex h-full flex-col rounded-md border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-content">{document.title}</h3>
            <p className="text-sm text-content-tertiary">{document.fileName}</p>
          </div>
          <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
            {showEditAction && (
              <Link
                href={editHref}
                className="inline-flex items-center gap-1.5 rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Pencil size={14} aria-hidden="true" />
                Edit
              </Link>
            )}
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
            {canPreview && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-edge-strong p-2 text-content-secondary transition-colors hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                aria-label="Expand preview"
                title="Expand preview"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="hidden rounded-md border border-edge-strong px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover lg:inline-flex"
              >
                Close preview
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {renderPreviewBody()}
        </div>

        {document.description && (
          <div className="border-t border-edge px-4 py-3">
            <p className="text-sm text-content-secondary">{document.description}</p>
          </div>
        )}
      </div>
      <DocumentViewerModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        communityId={communityId}
        documentId={document.id}
        fileName={document.fileName}
      />
    </>
  );
}
