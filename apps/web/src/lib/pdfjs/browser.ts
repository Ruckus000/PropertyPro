import * as Sentry from '@sentry/nextjs';

export const PDFJS_MODULE_PATH = '/pdfjs/pdf.mjs';
export const PDFJS_WORKER_PATH = '/pdfjs/pdf.worker.min.mjs';

export type PdfJsModule = typeof import('pdfjs-dist/build/pdf.mjs');

export type PdfViewerErrorStage =
  | 'module_import'
  | 'worker_load'
  | 'document_load'
  | 'page_render';

export interface PdfViewerUiError {
  message: string;
  stage: PdfViewerErrorStage;
}

type RuntimeImport = (modulePath: string) => Promise<PdfJsModule>;

const DEFAULT_PDF_VIEWER_ERROR_MESSAGE =
  "This PDF preview couldn't be loaded. Please try again.";
const DEFAULT_PDF_RENDER_ERROR_MESSAGE =
  "This PDF preview couldn't be rendered. Please try again.";

const defaultRuntimeImport: RuntimeImport = async (modulePath) =>
  import(
    /* @vite-ignore */
    /* webpackIgnore: true */
    modulePath
  ) as Promise<PdfJsModule>;

let runtimeImport: RuntimeImport = defaultRuntimeImport;

function buildPdfJsAssetUrl(assetPath: string, cacheBustKey?: string): string {
  if (!cacheBustKey) {
    return assetPath;
  }

  return `${assetPath}?v=${encodeURIComponent(cacheBustKey)}`;
}

export function __setPdfJsRuntimeImportForTests(nextImport: RuntimeImport | null): void {
  runtimeImport = nextImport ?? defaultRuntimeImport;
}

export function configurePdfJsWorker(
  pdfjs: Pick<PdfJsModule, 'GlobalWorkerOptions'>,
  cacheBustKey?: string,
): void {
  pdfjs.GlobalWorkerOptions.workerSrc = buildPdfJsAssetUrl(
    PDFJS_WORKER_PATH,
    cacheBustKey,
  );
}

export async function loadPdfJs(cacheBustKey?: string): Promise<PdfJsModule> {
  const modulePath = buildPdfJsAssetUrl(PDFJS_MODULE_PATH, cacheBustKey);
  const pdfjs = await runtimeImport(modulePath);
  configurePdfJsWorker(pdfjs, cacheBustKey);
  return pdfjs;
}

export async function preloadPdfJs(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  await loadPdfJs();
}

export function isPdfRenderCancellation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Rendering cancelled');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

function isLikelyWorkerLoadError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('worker')
    || normalizedMessage.includes('setting up fake worker')
    || normalizedMessage.includes('importscripts');
}

export function createPdfViewerUiError(
  error: unknown,
  stage: PdfViewerErrorStage,
): PdfViewerUiError {
  const message = getErrorMessage(error);
  const resolvedStage = stage === 'document_load' && isLikelyWorkerLoadError(message)
    ? 'worker_load'
    : stage;

  return {
    stage: resolvedStage,
    message: resolvedStage === 'page_render'
      ? DEFAULT_PDF_RENDER_ERROR_MESSAGE
      : DEFAULT_PDF_VIEWER_ERROR_MESSAGE,
  };
}

export function reportPdfViewerError(
  error: unknown,
  options: {
    stage: PdfViewerErrorStage;
    pdfUrl?: string;
    hasPdfData: boolean;
  },
): void {
  const rawMessage = getErrorMessage(error);
  const captureError = error instanceof Error
    ? error
    : new Error(rawMessage || `PDF.js ${options.stage} failure`);

  Sentry.captureException(captureError, {
    tags: {
      area: 'pdfjs',
      stage: options.stage,
    },
    extra: {
      pdfModulePath: PDFJS_MODULE_PATH,
      pdfWorkerPath: PDFJS_WORKER_PATH,
      hasPdfUrl: Boolean(options.pdfUrl),
      hasPdfData: options.hasPdfData,
      rawMessage: rawMessage || undefined,
    },
  });
}
