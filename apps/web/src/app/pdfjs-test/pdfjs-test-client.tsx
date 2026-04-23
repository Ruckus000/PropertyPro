'use client';

import { useState } from 'react';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import {
  PDFJS_INVALID_PDF_TEXT,
  PDFJS_SMOKE_TEST_PDF_BASE64,
} from '@/lib/pdfjs/fixtures';

type PdfJsTestVariant = 'valid' | 'invalid';

function decodeBase64Pdf(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function PdfJsTestClient({
  initialVariant,
}: {
  initialVariant: PdfJsTestVariant;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [pdfData] = useState(() => (
    initialVariant === 'invalid'
      ? new TextEncoder().encode(PDFJS_INVALID_PDF_TEXT)
      : decodeBase64Pdf(PDFJS_SMOKE_TEST_PDF_BASE64)
  ));

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12"
    >
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-content-secondary">
          PDF.js Runtime Harness
        </p>
        <h1 className="text-3xl font-semibold text-content">
          Production PDF preview smoke page
        </h1>
        <p className="max-w-2xl text-sm text-content-secondary">
          This page exists for runtime verification of the same `PdfViewer`
          component used throughout the product. Variant:{' '}
          <span className="font-medium text-content">{initialVariant}</span>
          {totalPages !== null ? ` • ${totalPages} page${totalPages === 1 ? '' : 's'}` : ''}
        </p>
      </div>

      <PdfViewer
        pdfData={pdfData}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onDocumentLoad={({ totalPages: nextTotalPages }) => {
          setCurrentPage((page) => Math.min(page, Math.max(nextTotalPages - 1, 0)));
          setTotalPages(nextTotalPages);
        }}
      />
    </main>
  );
}
