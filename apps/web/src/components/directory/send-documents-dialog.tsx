'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDocuments, useSendDocuments, type DocumentSendResult } from '@/hooks/use-documents';
import { cn } from '@/lib/utils';
import { plural } from './directory-model';

const MAX_DOCUMENTS = 10; // matches the API contract

/**
 * Pick documents and send them to one or more members (a courtesy copy — see
 * `shareDocuments`). Mount with a fresh `key` per open: the `sendId` minted
 * here is the idempotency key, so a retry after an error reuses it and nobody
 * is emailed twice, while a new send gets a new one.
 *
 * More than one recipient asks for confirmation inside this dialog rather than
 * stacking a second modal on top.
 */
export function SendDocumentsDialog({
  open,
  onOpenChange,
  communityId,
  userIds,
  recipientLabel,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  userIds: readonly string[];
  /** "Ana Ruiz", "residents of Unit 4B (3)", "12 residents". */
  recipientLabel: string;
  onSent: (results: DocumentSendResult[]) => void;
}) {
  const docsQ = useDocuments({ communityId, enabled: open });
  const send = useSendDocuments(communityId);
  const [sendId] = useState(() => crypto.randomUUID());
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = docsQ.data ?? [];
    return q ? all.filter((d) => d.title.toLowerCase().includes(q)) : all;
  }, [docsQ.data, query]);

  const n = picked.size;
  const k = userIds.length;
  const docNoun = plural(n, 'document');
  const recipientNoun = plural(k, 'resident');

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_DOCUMENTS) next.add(id);
      return next;
    });
  }

  function handleOpenChange(next: boolean) {
    if (send.isPending) return;
    onOpenChange(next);
  }

  async function submit() {
    if (n === 0) return;
    if (k > 1 && !confirming) {
      setConfirming(true);
      return;
    }
    try {
      const results = await send.mutateAsync({ documentIds: [...picked], userIds: [...userIds], sendId });
      onSent(results);
    } catch {
      // Rendered from send.error; Send again reuses the same sendId.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{confirming ? `Send ${docNoun} to ${recipientNoun}?` : 'Send documents'}</DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Each resident is emailed a link unless they turned off document emails or get a digest, and only receives the documents their role can open. The send is recorded in the audit trail.'
              : `To ${recipientLabel}`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? null : (
          <div className="flex flex-col gap-3">
            <Input
              type="search"
              aria-label="Filter documents"
              placeholder="Filter documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <fieldset className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              <legend className="sr-only">Documents (up to {MAX_DOCUMENTS})</legend>
              {docsQ.isLoading ? (
                <p className="text-sm text-content-secondary">Loading documents…</p>
              ) : docsQ.isError ? (
                <p role="alert" className="text-sm text-status-danger">
                  Couldn&apos;t load documents.
                </p>
              ) : docs.length === 0 ? (
                <p className="text-sm text-content-secondary">
                  {query ? 'No documents match.' : 'No documents have been uploaded yet.'}
                </p>
              ) : (
                docs.map((d) => {
                  const on = picked.has(d.id);
                  const full = !on && n >= MAX_DOCUMENTS;
                  return (
                    <label
                      key={d.id}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2',
                        on ? 'border-interactive bg-interactive-subtle' : 'border-edge bg-surface-card',
                        full && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={full}
                        onChange={() => toggle(d.id)}
                        className="h-4 w-4 accent-interactive"
                      />
                      <FileText size={16} className="shrink-0 text-content-secondary" aria-hidden="true" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-content">{d.title}</span>
                        <span className="text-xs text-content-tertiary">
                          Posted {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </fieldset>
            <p className="rounded-md bg-surface-subtle px-3 py-2.5 text-xs text-content-secondary">
              Up to {MAX_DOCUMENTS} published documents. This is a courtesy copy, not official notice: it follows each
              resident&apos;s email settings. Each send is recorded in the audit trail.
            </p>
          </div>
        )}

        {send.error ? (
          <p role="alert" className="text-sm text-status-danger">
            {send.error.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => (confirming ? setConfirming(false) : handleOpenChange(false))}
            disabled={send.isPending}
          >
            {confirming ? 'Back' : 'Cancel'}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={n === 0 || send.isPending}>
            {send.isPending ? 'Sending…' : n === 0 ? 'Select documents' : `Send ${docNoun}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
