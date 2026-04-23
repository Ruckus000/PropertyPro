/**
 * pdfjs-dist worker configuration for Next.js.
 *
 * Import this module once before any pdfjs-dist usage (e.g., at the top of
 * the PDF viewer component). The assets are served from the app's public
 * directory to avoid traced-runtime file lookups.
 *
 * This file guards against SSR — pdfjs-dist uses browser globals that are
 * unavailable during server-side rendering.
 */
import { preloadPdfJs } from '@/lib/pdfjs/browser';

if (typeof window !== 'undefined') {
  void preloadPdfJs().catch(() => {
    // PdfViewer will surface and report runtime failures with user-facing retry.
  });
}
