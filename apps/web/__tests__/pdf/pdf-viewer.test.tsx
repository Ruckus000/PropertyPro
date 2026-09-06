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
  type PdfJsModule,
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

/*
 * The viewer touches exactly two members of the pdfjs module —
 * `GlobalWorkerOptions.workerSrc` and `getDocument().promise` — so the double
 * implements that slice and nothing else. `PdfJsModule` is the whole
 * pdfjs-dist export surface and its `getDocument` returns a real
 * `PDFDocumentLoadingTask`, which a stub cannot satisfy structurally, so the
 * double/real boundary is asserted once here instead of at each call site.
 */
function createPdfJsModule(
  documentPromise: Promise<ReturnType<typeof createPdfDocument>>,
): PdfJsModule {
  const double = {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({
      promise: documentPromise,
    })),
  };
  return double as unknown as PdfJsModule;
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
  describe('fitToWidth', () => {
    /**
     * A PDF page is rendered at its intrinsic point size — 612 CSS px for US
     * Letter. On a 375px phone that is 237px wider than the viewport, so a third
     * of the signing page's required fields sat off the right edge (measured on
     * the seeded Proxy Designation Form: three of six fields at x 370-492).
     *
     * The rule is the design prototype's: scale down to fit, never up.
     */
    function stubClientWidth(width: number) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() {
          return width;
        },
      });
    }

    afterEach(() => {
      // `vi.restoreAllMocks()` cannot undo a defineProperty, so the stub would
      // otherwise leak into every later test in this file.
      // `clientWidth` is declared `readonly` in lib.dom, and `Partial<>` keeps
      // that modifier, so the delete needs a view with it stripped.
      type MutableHTMLElement = { -readonly [K in keyof HTMLElement]?: HTMLElement[K] };
      delete (HTMLElement.prototype as MutableHTMLElement).clientWidth;
    });

    /** The scale the canvas was actually rendered at. */
    function renderedScale(page: PdfPageDouble): number {
      const calls = page.getViewport.mock.calls as Array<[{ scale: number }]>;
      return calls[calls.length - 1]![0].scale;
    }

    async function renderViewer(props: { fitToWidth?: boolean }) {
      const page = createPdfPage();
      const pdfjsModule = createPdfJsModule(Promise.resolve(createPdfDocument(page)));
      __setPdfJsRuntimeImportForTests(async () => pdfjsModule);

      render(
        <PdfViewer
          pdfUrl="https://storage.example.com/letter.pdf"
          currentPage={0}
          onPageChange={vi.fn()}
          onDocumentLoad={vi.fn()}
          scale={1}
          {...props}
        />,
      );

      await waitFor(() => {
        expect(page.render).toHaveBeenCalled();
      });
      return page;
    }

    it('scales a 612pt page down to a 311px container', async () => {
      stubClientWidth(311);

      const page = await renderViewer({ fitToWidth: true });

      expect(renderedScale(page)).toBeCloseTo(311 / 612, 5);
    });

    it('never scales up when there is room to spare', async () => {
      // A wider container must not magnify the page past its own resolution.
      stubClientWidth(1400);

      const page = await renderViewer({ fitToWidth: true });

      expect(renderedScale(page)).toBe(1);
    });

    it('leaves the scale alone when fitToWidth is off', async () => {
      // The template editor converts pixel drag deltas with the page's
      // intrinsic width, so it must keep rendering at exactly `scale`.
      stubClientWidth(311);

      const page = await renderViewer({});

      expect(renderedScale(page)).toBe(1);
    });

    it('re-fits when the window resizes', async () => {
      stubClientWidth(311);
      const page = await renderViewer({ fitToWidth: true });
      expect(renderedScale(page)).toBeCloseTo(311 / 612, 5);

      stubClientWidth(500);
      fireEvent(window, new Event('resize'));

      await waitFor(() => {
        expect(renderedScale(page)).toBeCloseTo(500 / 612, 5);
      });
    });
  });
});
