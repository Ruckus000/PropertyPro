import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

vi.unmock('@/components/pdf/pdf-viewer');

import {
  __setPdfJsRuntimeImportForTests,
  PDFJS_WORKER_PATH,
} from '../../src/lib/pdfjs/browser';
import { PdfViewer } from '../../src/components/pdf/pdf-viewer';

type PdfPageDouble = {
  cancel: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  getViewport: ReturnType<typeof vi.fn>;
};

function createPdfPage(
  renderPromiseOrFactory: Promise<void> | (() => Promise<void>) = Promise.resolve(),
): PdfPageDouble {
  const cancel = vi.fn();
  const render = vi.fn(() => ({
    promise: typeof renderPromiseOrFactory === 'function'
      ? renderPromiseOrFactory()
      : renderPromiseOrFactory,
    cancel,
  }));
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 612 * scale,
    height: 792 * scale,
  }));

  return {
    cancel,
    render,
    getViewport,
  };
}

function createPdfDocument(page: PdfPageDouble, numPages = 1) {
  return {
    numPages,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(async () => undefined),
  };
}

function createPdfJsModule(documentPromise: Promise<ReturnType<typeof createPdfDocument>>) {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({
      promise: documentPromise,
    })),
  };
}

describe('PdfViewer', () => {
  beforeEach(() => {
    captureExceptionMock.mockReset();
    __setPdfJsRuntimeImportForTests(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __setPdfJsRuntimeImportForTests(null);
  });

  it('normalizes dynamic import failures and recovers on retry', async () => {
    const page = createPdfPage();
    const pdfDocument = createPdfDocument(page);
    const pdfjsModule = createPdfJsModule(Promise.resolve(pdfDocument));
    const runtimeImport = vi.fn()
      .mockRejectedValueOnce(
        new TypeError('Failed to fetch dynamically imported module: http://localhost:3000/pdfjs/pdf.mjs'),
      )
      .mockResolvedValueOnce(pdfjsModule);
    const onDocumentLoad = vi.fn();

    __setPdfJsRuntimeImportForTests(runtimeImport);

    render(
      <PdfViewer
        pdfUrl="https://storage.example.com/sample.pdf"
        currentPage={0}
        onPageChange={vi.fn()}
        onDocumentLoad={onDocumentLoad}
      />,
    );

    expect(
      await screen.findByText("This PDF preview couldn't be loaded. Please try again."),
    ).toBeVisible();
    expect(
      screen.queryByText(/Failed to fetch dynamically imported module/i),
    ).not.toBeInTheDocument();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'module_import' }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(onDocumentLoad).toHaveBeenCalledWith({
        totalPages: 1,
        pageDimensions: [{ width: 612, height: 792 }],
      });
    });
    await waitFor(() => {
      expect(pdfjsModule.GlobalWorkerOptions.workerSrc).toContain(PDFJS_WORKER_PATH);
    });
    expect(runtimeImport).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText("This PDF preview couldn't be loaded. Please try again."),
    ).not.toBeInTheDocument();
  });

  it('classifies worker bootstrap failures separately from generic document load failures', async () => {
    const pdfjsModule = createPdfJsModule(
      Promise.reject(
        new Error('Setting up fake worker failed: Unable to fetch pdf.worker.min.mjs'),
      ),
    );

    __setPdfJsRuntimeImportForTests(async () => pdfjsModule);

    render(
      <PdfViewer
        pdfUrl="https://storage.example.com/worker.pdf"
        currentPage={0}
        onPageChange={vi.fn()}
        onDocumentLoad={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("This PDF preview couldn't be loaded. Please try again."),
    ).toBeVisible();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'worker_load' }),
      }),
    );
  });

  it('surfaces generic document load failures with stable error copy', async () => {
    const pdfjsModule = createPdfJsModule(Promise.reject(new Error('Invalid PDF structure')));

    __setPdfJsRuntimeImportForTests(async () => pdfjsModule);

    render(
      <PdfViewer
        pdfUrl="https://storage.example.com/bad.pdf"
        currentPage={0}
        onPageChange={vi.fn()}
        onDocumentLoad={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("This PDF preview couldn't be loaded. Please try again."),
    ).toBeVisible();
    expect(screen.queryByText(/Invalid PDF structure/i)).not.toBeInTheDocument();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'document_load' }),
      }),
    );
  });

  it('surfaces render failures with stable render copy', async () => {
    const page = createPdfPage(() => Promise.reject(new Error('Canvas renderer exploded')));
    const pdfjsModule = createPdfJsModule(Promise.resolve(createPdfDocument(page)));

    __setPdfJsRuntimeImportForTests(async () => pdfjsModule);

    render(
      <PdfViewer
        pdfUrl="https://storage.example.com/render.pdf"
        currentPage={0}
        onPageChange={vi.fn()}
        onDocumentLoad={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("This PDF preview couldn't be rendered. Please try again."),
    ).toBeVisible();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'page_render' }),
      }),
    );
  });

  it('does not surface render cancellation as an error', async () => {
    const page = createPdfPage(() => Promise.reject(new Error('Rendering cancelled, page 1')));
    const pdfjsModule = createPdfJsModule(Promise.resolve(createPdfDocument(page)));
    const onDocumentLoad = vi.fn();

    __setPdfJsRuntimeImportForTests(async () => pdfjsModule);

    render(
      <PdfViewer
        pdfUrl="https://storage.example.com/cancelled.pdf"
        currentPage={0}
        onPageChange={vi.fn()}
        onDocumentLoad={onDocumentLoad}
      />,
    );

    await waitFor(() => {
      expect(onDocumentLoad).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(page.render).toHaveBeenCalled();
    });

    expect(
      screen.queryByText("This PDF preview couldn't be rendered. Please try again."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
