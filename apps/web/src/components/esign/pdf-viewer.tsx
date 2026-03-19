'use client';

/**
 * PdfViewer — Renders PDF pages via pdfjs-dist to canvas with HiDPI support.
 *
 * Provides a slot (`children`) for overlaying field markers on top of the
 * rendered page.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

/** Lazily load pdfjs-dist (browser-only) and configure the worker. */
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  return pdfjs;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageDimension {
  width: number;
  height: number;
}

interface DocumentMeta {
  totalPages: number;
  pageDimensions: PageDimension[];
}

export interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onDocumentLoad: (meta: DocumentMeta) => void;
  scale?: number;
  className?: string;
  children?: ReactNode; // overlay slot for field markers
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PdfViewer({
  pdfUrl,
  currentPage,
  onPageChange,
  onDocumentLoad,
  scale = 1,
  className,
  children,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<
    Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']
  > | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<PageDimension>({
    width: 0,
    height: 0,
  });

  // -----------------------------------------------------------------------
  // Load PDF document
  // -----------------------------------------------------------------------
  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Collect page dimensions
      const dimensions: PageDimension[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        dimensions.push({ width: viewport.width, height: viewport.height });
      }

      onDocumentLoad({ totalPages: pdf.numPages, pageDimensions: dimensions });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
      setLoading(false);
    }
  }, [pdfUrl, onDocumentLoad]);

  useEffect(() => {
    void loadDocument();
    return () => {
      if (pdfDocRef.current) {
        void pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // -----------------------------------------------------------------------
  // Render current page
  // -----------------------------------------------------------------------
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || loading || error) return;

    let cancelled = false;

    async function renderPage() {
      // Cancel any in-flight render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      try {
        const page = await pdf!.getPage(currentPage + 1); // pdfjs is 1-indexed
        const viewport = page.getViewport({ scale });
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

        canvas!.width = Math.floor(viewport.width * dpr);
        canvas!.height = Math.floor(viewport.height * dpr);
        canvas!.style.width = `${viewport.width}px`;
        canvas!.style.height = `${viewport.height}px`;

        setCanvasDimensions({
          width: viewport.width,
          height: viewport.height,
        });

        const task = page.render({ canvas: canvas!, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled) {
          renderTaskRef.current = null;
        }
      } catch (err) {
        // RenderingCancelled is expected when switching pages quickly
        if (
          err instanceof Error &&
          err.message.includes('Rendering cancelled')
        ) {
          return;
        }
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to render page',
          );
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [currentPage, scale, loading, error]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-12 ${className ?? ''}`}
      >
        <p className="text-sm text-[var(--status-danger)]">{error}</p>
        <button
          type="button"
          onClick={() => void loadDocument()}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--interactive-primary-hover)] transition-colors"
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-12 ${className ?? ''}`}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-tertiary)]">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      {/* Canvas + overlay wrapper */}
      <div ref={containerRef} className="relative inline-block">
        <canvas
          ref={canvasRef}
          className="rounded-sm shadow-md"
        />
        {/* Overlay slot for field markers */}
        {children && canvasDimensions.width > 0 && (
          <div
            className="absolute inset-0"
            style={{
              width: canvasDimensions.width,
              height: canvasDimensions.height,
            }}
          >
            {children}
          </div>
        )}
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              onPageChange(Math.min(totalPages - 1, currentPage + 1))
            }
            disabled={currentPage >= totalPages - 1}
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
