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
  // Dynamic import avoids pdfjs-dist being evaluated on the server
  import('pdfjs-dist').then(({ GlobalWorkerOptions }) => {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  });
}
