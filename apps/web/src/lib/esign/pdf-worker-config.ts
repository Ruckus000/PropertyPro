/**
 * pdfjs-dist worker configuration for Next.js.
 *
 * Import this module once before any pdfjs-dist usage (e.g., at the top of
 * the PDF viewer component). Without explicit worker configuration, PDF
 * rendering silently fails.
 *
 * This file guards against SSR — pdfjs-dist uses browser globals that are
 * unavailable during server-side rendering.
 */
if (typeof window !== 'undefined') {
  // @ts-expect-error — runtime-only import from same-origin proxy route; not a real module path
  import(/* webpackIgnore: true */ '/pdfjs/pdf.mjs').then(
    ({ GlobalWorkerOptions }: { GlobalWorkerOptions: { workerSrc: string } }) => {
      GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    },
  );
}
