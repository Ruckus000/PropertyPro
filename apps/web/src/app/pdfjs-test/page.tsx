import type { Metadata } from 'next';
import { PdfJsTestClient } from './pdfjs-test-client';

export const metadata: Metadata = {
  title: 'PDF.js Runtime Harness',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PdfJsTestPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;

  return (
    <PdfJsTestClient initialVariant={variant === 'invalid' ? 'invalid' : 'valid'} />
  );
}
