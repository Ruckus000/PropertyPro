'use client';

/**
 * "Replace file" for one uploaded document.
 *
 * The document keeps its id, title, category and audience; only the file
 * changes. That is what makes "the link stays the same" true for the public
 * site, the compliance item it satisfies, and any page that links to it.
 */

import { useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import { useDocumentUpload, type ReplaceFileResult } from '@/hooks/use-document-upload';
import type { DocumentRow } from '@/lib/documents/document-state';
import {
  RedactionAttestationField,
  categoryRequiresRedactionAttestation,
} from './redaction-attestation-field';

interface DocumentReplaceFileProps {
  communityId: number;
  document: DocumentRow;
  onReplaced: (result: ReplaceFileResult) => void;
}

export function DocumentReplaceFile({ communityId, document, onReplaced }: DocumentReplaceFileProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [redactionAttested, setRedactionAttested] = useState(false);
  const { replaceFile, isUploading, progress, error } = useDocumentUpload();
  const { categories } = useDocumentCategories(communityId);

  const categoryName = categories.find((c) => c.id === document.categoryId)?.name ?? null;
  // Mirrors the server: the category decides whether a question is asked (the
  // public flag only decides WHICH attestation is recorded), as in
  // `publish-document-dialog.tsx`. The server remains the enforcement point.
  // A draft reaches no owner yet, so the server asks nothing (the question
  // comes when it is posted). Only a real NULL is a draft.
  const requiresAttestation =
    document.postedAt !== null && categoryRequiresRedactionAttestation(categoryName);

  const inputId = `document-replace-file-${document.id}`;

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" aria-hidden="true" />
        Replace file
      </Button>
    );
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    // The attestation is about a specific file; a different file revokes it.
    setRedactionAttested(false);
  };

  const handleReplace = async () => {
    if (!file) return;
    try {
      const result = await replaceFile({ communityId, documentId: document.id, file, redactionAttested });
      toast.success('File replaced. The link stays the same.');
      setOpen(false);
      setFile(null);
      setRedactionAttested(false);
      onReplaced(result);
    } catch {
      // Surfaced below via the hook's error state.
    }
  };

  return (
    <div className="w-full space-y-3 rounded-md border border-edge bg-surface-subtle p-3">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-content">
          New file for “{document.title}”
        </label>
        <input
          id={inputId}
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={handleFile}
          disabled={isUploading}
          className="block w-full text-sm text-content-secondary"
        />
        <p className="mt-1 text-xs text-content-tertiary">
          The title, category and link stay the same. The change is recorded in your audit log.
        </p>
      </div>

      {file && requiresAttestation && (
        <RedactionAttestationField
          id={`${inputId}-redaction`}
          checked={redactionAttested}
          onChange={setRedactionAttested}
          disabled={isUploading}
        />
      )}

      {isUploading && (
        <p className="text-sm text-content-secondary" aria-live="polite">
          Uploading… {progress}%
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void handleReplace()}
          loading={isUploading}
          disabled={!file || (requiresAttestation && !redactionAttested)}
        >
          Replace file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isUploading}
          onClick={() => {
            setOpen(false);
            setFile(null);
            setRedactionAttested(false);
          }}
        >
          Keep the current file
        </Button>
      </div>
    </div>
  );
}
