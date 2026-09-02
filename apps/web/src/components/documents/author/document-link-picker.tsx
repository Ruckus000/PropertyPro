'use client';

/**
 * Modal dialog for picking a document to insert as a link chip in the
 * authored-document editor. Backed by GET /api/v1/documents/drafts/[id]/document-search.
 */
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDocumentSearch, type DocumentLinkPickerResult } from '@/hooks/use-document-draft';

interface DocumentLinkPickerProps {
  communityId: number;
  draftId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolved when the user confirms a selection. */
  onPicked: (result: DocumentLinkPickerResult) => void;
}

export function DocumentLinkPicker({
  communityId,
  draftId,
  open,
  onOpenChange,
  onPicked,
}: DocumentLinkPickerProps) {
  const [query, setQuery] = React.useState('');
  const search = useDocumentSearch(communityId, draftId, query);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-edge bg-surface-card shadow-lg"
        >
          <div className="border-b border-edge px-5 py-4">
            <Dialog.Title className="text-base font-semibold text-content">
              Insert document link
            </Dialog.Title>
          </div>
          <div className="px-5 py-4">
            <label htmlFor="doc-link-search" className="sr-only">
              Search documents
            </label>
            <input
              id="doc-link-search"
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title…"
              className="w-full rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            />
            <ul
              role="listbox"
              aria-label="Document results"
              className="mt-3 max-h-72 overflow-y-auto"
            >
              {search.isLoading && (
                <li className="px-1 py-3 text-sm text-content-secondary">Searching…</li>
              )}
              {search.error != null && (
                <li className="px-1 py-3 text-sm text-status-danger" role="alert">
                  Couldn&apos;t load documents. Try again.
                </li>
              )}
              {!search.isLoading && (search.data ?? []).length === 0 && !search.error && (
                <li className="px-1 py-3 text-sm text-content-secondary">No documents found.</li>
              )}
              {(search.data ?? []).map((doc) => (
                <li key={doc.documentId}>
                  <button
                    type="button"
                    onClick={() => {
                      onPicked(doc);
                      onOpenChange(false);
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                  >
                    <span className="block font-medium text-content">{doc.title}</span>
                    <span className="block text-xs text-content-secondary">
                      {doc.category ?? 'Uncategorized'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-edge-strong px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
