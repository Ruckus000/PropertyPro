'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Minimize2 } from 'lucide-react';
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

interface DocumentViewerProps {
  communityId: number;
  document: DocumentListItem | null;
  onClose?: () => void;
  onViewVersions?: (document: DocumentListItem) => void;
}

type PreviewModalSize = 'standard' | 'large' | 'full';

const PREVIEW_MODAL_SIZE_OPTIONS: Array<{
  id: PreviewModalSize;
  label: string;
  statusLabel: string;
  contentClassName: string;
  imageWidthPercent: number;
  pdfScale: number;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    statusLabel: '100%',
    contentClassName: 'h-[min(84vh,780px)] w-[min(96vw,720px)] rounded-lg',
    imageWidthPercent: 100,
    pdfScale: 1,
  },
  {
    id: 'large',
    label: 'Large',
    statusLabel: '115%',
    contentClassName: 'h-[min(90vh,920px)] w-[min(98vw,960px)] rounded-lg',
    imageWidthPercent: 125,
    pdfScale: 1.15,
  },
  {
    id: 'full',
    label: 'Full screen',
    statusLabel: '130%',
    contentClassName: 'left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0',
    imageWidthPercent: 150,
    pdfScale: 1.3,
  },
];
const DEFAULT_PREVIEW_MODAL_SIZE = PREVIEW_MODAL_SIZE_OPTIONS[1]!;

export function DocumentViewer({
  communityId,
  document,
  onClose,
  onViewVersions,
}: DocumentViewerProps) {
  const [preview, setPreview] = useState<DocumentPreviewResult>({ state: 'idle' });
  const [currentPage, setCurrentPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<PreviewModalSize>('large');

  const downloadHref = document
    ? `/api/v1/documents/${document.id}/download?communityId=${communityId}&attachment=true`
    : '#';
  const canPreview = document ? isPreviewableMimeType(document.mimeType) : false;
  const isPdf = document ? isPdfMimeType(document.mimeType) : false;
  const isImage = document ? isImageMimeType(document.mimeType) : false;
  const showDownloadAction = Boolean(document) && (!canPreview || preview.state === 'ready');
  const documentTitle = document?.title ?? 'Document preview';
  const activeModalSize = PREVIEW_MODAL_SIZE_OPTIONS.find((option) => option.id === modalSize)
    ?? DEFAULT_PREVIEW_MODAL_SIZE;
  const activeModalSizeIndex = PREVIEW_MODAL_SIZE_OPTIONS.findIndex((option) => option.id === activeModalSize.id);
  const canDecreaseModalSize = activeModalSizeIndex > 0;
  const canIncreaseModalSize = activeModalSizeIndex < PREVIEW_MODAL_SIZE_OPTIONS.length - 1;

  function retryPreview() {
    setReloadToken((token) => token + 1);
  }

  function increasePreviewSize() {
    if (!canIncreaseModalSize) {
      return;
    }

    setModalSize(PREVIEW_MODAL_SIZE_OPTIONS[activeModalSizeIndex + 1]!.id);
  }

  function decreasePreviewSize() {
    if (!canDecreaseModalSize) {
      return;
    }

    setModalSize(PREVIEW_MODAL_SIZE_OPTIONS[activeModalSizeIndex - 1]!.id);
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
    setModalSize('large');
  }, [document?.id]);

  function renderPreviewBody(surface: 'inline' | 'modal') {
    const isModalSurface = surface === 'modal';
    const pdfScale = isModalSurface ? activeModalSize.pdfScale : 1;

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
            <div className={cn(isModalSurface ? 'min-h-full' : 'h-full')}>
              <PdfViewer
                pdfUrl={preview.url}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onDocumentLoad={({ totalPages }) => {
                  setCurrentPage((page) => Math.min(page, Math.max(totalPages - 1, 0)));
                }}
                scale={pdfScale}
              />
            </div>
          )}
          {isImage && (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <img
                src={preview.url}
                alt={documentTitle}
                className={cn(
                  'object-contain',
                  isModalSurface ? 'max-h-none max-w-none' : 'max-h-full max-w-full',
                )}
                style={isModalSurface
                  ? {
                    width: `${activeModalSize.imageWidthPercent}%`,
                  }
                  : undefined}
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
          {renderPreviewBody('inline')}
        </div>

        {document.description && (
          <div className="border-t border-edge px-4 py-3">
            <p className="text-sm text-content-secondary">{document.description}</p>
          </div>
        )}
      </div>

      {canPreview && (
        <DialogPrimitive.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              data-testid="document-preview-modal-overlay"
              className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            />
            <DialogPrimitive.Content
              data-testid="document-preview-modal"
              data-preview-size={modalSize}
              className={cn(
                'fixed left-1/2 top-1/2 z-50 flex max-h-screen w-full max-w-[960px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-edge bg-surface-card shadow-e3 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                activeModalSize.contentClassName,
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="truncate text-lg font-semibold text-content">
                    {document.title}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 text-sm text-content-tertiary">
                    {document.fileName}
                  </DialogPrimitive.Description>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex min-h-10 items-center rounded-md border border-edge-strong bg-surface-card">
                    <button
                      type="button"
                      onClick={decreasePreviewSize}
                      disabled={!canDecreaseModalSize}
                      aria-label="Decrease preview size"
                      title="Decrease preview size"
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-l-md px-3 text-lg font-semibold text-content-secondary transition-colors hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      -
                    </button>
                    <div className="min-w-16 border-x border-edge px-3 text-center text-sm font-medium text-content">
                      {activeModalSize.statusLabel}
                    </div>
                    <button
                      type="button"
                      onClick={increasePreviewSize}
                      disabled={!canIncreaseModalSize}
                      aria-label="Increase preview size"
                      title="Increase preview size"
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-r-md px-3 text-lg font-semibold text-content-secondary transition-colors hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-edge-strong px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                    >
                      <Minimize2 className="h-4 w-4" />
                      Close
                    </button>
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-surface-page px-4 py-4 sm:px-6 sm:py-6">
                {renderPreviewBody('modal')}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );
}
