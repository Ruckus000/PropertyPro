import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PdfJsTestClient } from './pdfjs-test-client';

export const metadata: Metadata = {
  title: 'PDF.js Runtime Harness',
  robots: {
    index: false,
    follow: false,
  },
};

// Force per-request evaluation so the PDFJS_TEST_ENABLED gate below reflects
// the runtime env, not the build-time env (which would otherwise prerender
// a permanent 404 into the static output).
export const dynamic = 'force-dynamic';

export default async function PdfJsTestPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  // Test harness page — served only when CI opts in. Vercel production leaves
  // the flag unset so this returns 404 and the page stays out of production.
  if (process.env.PDFJS_TEST_ENABLED !== '1') {
    notFound();
  }

  const { variant } = await searchParams;

  return (
    <PdfJsTestClient initialVariant={variant === 'invalid' ? 'invalid' : 'valid'} />
  );
}
