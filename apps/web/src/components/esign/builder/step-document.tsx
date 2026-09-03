'use client';

/**
 * Step 1 — the document.
 *
 * Two ways in, because both are how the work actually arrives: a PDF on the
 * author's disk, or one already in the community's Documents library. The
 * library route copies the file into the e-sign prefix server-side; an upload
 * is held locally and sent once, at commit, so an abandoned builder leaves
 * nothing in storage.
 */

import { useCallback, useRef, useState } from 'react';
import { FileText, FolderOpen, Loader2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocuments } from '@/hooks/use-documents';
import { useImportEsignLibraryDocument } from '@/hooks/use-esign-templates';
import type { BuilderDocument } from '@/lib/esign/builder-state';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface StepDocumentProps {
  communityId: number;
  document: BuilderDocument | null;
  /** The upload is held here until commit; null once a library file is used. */
  onPick: (doc: BuilderDocument, file: File | null) => void;
  onClear: () => void;
}

type Source = 'upload' | 'library';

interface LibraryDocument {
  id: number;
  title: string;
  fileName: string;
  mimeType: string;
}

export function StepDocument({ communityId, document, onPick, onClear }: StepDocumentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>('upload');
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);

  const { data: libraryData, isLoading: libraryLoading } = useDocuments({
    communityId,
    enabled: source === 'library',
  });
  const importFromLibrary = useImportEsignLibraryDocument();

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);

      if (file.type !== 'application/pdf') {
        setError('That file is not a PDF. Choose a PDF to continue.');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError('That file is larger than 50 MB. Choose a smaller PDF.');
        return;
      }

      // Read the bytes now so the document is on screen for the rest of the
      // flow. PDF.js renders from bytes, which keeps blob: URLs out of the CSP.
      const buffer = await file.arrayBuffer();
      onPick(
        {
          sourceDocumentPath: null,
          name: file.name,
          pdfData: new Uint8Array(buffer),
          pdfUrl: null,
        },
        file,
      );
    },
    [onPick],
  );

  const handleLibraryPick = useCallback(
    async (doc: LibraryDocument) => {
      setError(null);
      setImportingId(doc.id);
      try {
        const result = await importFromLibrary.mutateAsync({
          communityId,
          documentId: doc.id,
        });
        onPick(
          {
            sourceDocumentPath: result.sourceDocumentPath,
            name: result.name,
            pdfData: null,
            pdfUrl: null,
          },
          null,
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'We could not use that document. Please try another.',
        );
      } finally {
        setImportingId(null);
      }
    },
    [communityId, importFromLibrary, onPick],
  );

  if (document) {
    return (
      <div className="rounded-lg border border-edge-subtle bg-surface-card p-6">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-content-tertiary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-content">{document.name}</p>
            <p className="mt-1 text-sm text-content-secondary">
              {document.sourceDocumentPath
                ? 'Copied from your Documents library.'
                : 'Ready to upload when you send.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-content-secondary transition-colors hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            <X className="size-4" aria-hidden="true" />
            Change
          </button>
        </div>
      </div>
    );
  }

  // Only PDFs: everything downstream — placing fields, flattening, the signed
  // output — assumes one, and the route rejects anything else after the copy.
  // Filtering here means the author never picks a file that cannot work.
  const libraryDocs = ((libraryData ?? []) as LibraryDocument[]).filter(
    (d) => d.mimeType === 'application/pdf',
  );

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Where the document comes from"
        className="inline-flex rounded-md border border-edge-subtle bg-surface-card p-1"
      >
        {(
          [
            { id: 'upload' as const, label: 'Upload a PDF', icon: Upload },
            { id: 'library' as const, label: 'Use a document you have', icon: FolderOpen },
          ]
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              onClick={() => setSource(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive',
                source === tab.id
                  ? 'bg-interactive-subtle text-content'
                  : 'text-content-secondary hover:text-content',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
        >
          {error}
        </div>
      )}

      {source === 'upload' ? (
        <div className="rounded-lg border border-dashed border-edge bg-surface-card p-10 text-center">
          <Upload className="mx-auto size-8 text-content-tertiary" aria-hidden="true" />
          <p className="mt-3 text-base font-medium text-content">Choose the PDF to be signed</p>
          <p className="mt-1 text-sm text-content-secondary">Up to 50 MB.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            <Upload className="size-4" aria-hidden="true" />
            Select PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-edge-subtle bg-surface-card">
          {libraryLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-content-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading your documents…
            </div>
          ) : libraryDocs.length === 0 ? (
            <div className="p-10 text-center">
              <FolderOpen className="mx-auto size-8 text-content-tertiary" aria-hidden="true" />
              <p className="mt-3 text-base font-medium text-content">
                Nothing in your library yet
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                Upload a PDF instead, or add it to Documents first.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {libraryDocs.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => void handleLibraryPick(doc)}
                    disabled={importingId !== null}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:opacity-50"
                  >
                    <FileText
                      className="size-4 shrink-0 text-content-tertiary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-content">
                      {doc.title || doc.fileName}
                    </span>
                    {importingId === doc.id && (
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-content-tertiary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
