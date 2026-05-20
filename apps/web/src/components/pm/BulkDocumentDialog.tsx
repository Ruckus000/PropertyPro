'use client';

/**
 * Bulk Document Dialog — upload documents to multiple communities at once.
 *
 * Uses shadcn Dialog, TanStack Mutation, and the bulk documents API.
 * Files are uploaded via the existing POST /api/v1/upload endpoint first,
 * then document records are created in each target community.
 */
import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useBulkUploadDocuments } from '@/hooks/use-bulk-documents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Community {
  id: number;
  name: string;
}

interface BulkDocumentDialogProps {
  selectedCommunities: Community[];
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkDocumentDialog({
  selectedCommunities,
  open,
  onClose,
}: BulkDocumentDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useBulkUploadDocuments({
    onProgress: (message) => setUploadProgress(message),
  });

  function handleSubmitConfirm() {
    if (!selectedCommunities[0]) return;
    mutation.mutate(
      {
        files,
        communityIds: selectedCommunities.map((c) => c.id),
        uploadCommunityId: selectedCommunities[0].id,
        description: description || null,
      },
      {
        onSuccess: (data) => {
          const created = data.results.filter((r) => r.status === 'created').length;
          const total = data.results.length;
          setResultMessage(`Documents created in ${created}/${total} communities`);
          setResultIsError(false);
          setShowConfirm(false);
          setUploadProgress(null);
        },
        onError: (error: Error) => {
          setResultMessage(error.message);
          setResultIsError(true);
          setShowConfirm(false);
          setUploadProgress(null);
        },
      },
    );
  }

  function resetForm() {
    setFiles([]);
    setDescription('');
    setShowConfirm(false);
    setResultMessage(null);
    setResultIsError(false);
    setUploadProgress(null);
    mutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (selected) {
      setFiles(Array.from(selected));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setShowConfirm(true);
  }

  function handleConfirm() {
    handleSubmitConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Document Upload</DialogTitle>
          <DialogDescription>
            Upload documents to {selectedCommunities.length} selected{' '}
            {selectedCommunities.length === 1 ? 'community' : 'communities'}.
          </DialogDescription>
        </DialogHeader>

        {resultMessage ? (
          <div className="space-y-4">
            <AlertBanner
              status={resultIsError ? 'danger' : 'success'}
              title={resultIsError ? 'Error' : 'Complete'}
              description={resultMessage}
            />
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : showConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-content">
              Upload <strong>{files.length}</strong>{' '}
              {files.length === 1 ? 'document' : 'documents'} to{' '}
              <strong>{selectedCommunities.length}</strong>{' '}
              {selectedCommunities.length === 1 ? 'community' : 'communities'}. Confirm?
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-content-tertiary">Files:</p>
              <ul className="max-h-20 space-y-0.5 overflow-y-auto text-xs text-content-secondary">
                {files.map((f, i) => (
                  <li key={i}>{f.name}</li>
                ))}
              </ul>
              <p className="text-xs font-medium text-content-tertiary">Communities:</p>
              <ul className="max-h-20 space-y-0.5 overflow-y-auto text-xs text-content-secondary">
                {selectedCommunities.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            </div>
            {uploadProgress && (
              <p className="text-xs text-content-link">{uploadProgress}</p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={mutation.isPending}
              >
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={mutation.isPending}>
                {mutation.isPending ? 'Uploading...' : 'Confirm & Upload'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File input */}
            <div>
              <label htmlFor="bulk-doc-files" className="mb-1 block text-sm font-medium text-content">
                Files
              </label>
              <input
                id="bulk-doc-files"
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-content-secondary file:mr-3 file:rounded file:border-0 file:bg-interactive/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-content-link hover:file:bg-interactive/20"
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs text-content-tertiary">
                  {files.length} {files.length === 1 ? 'file' : 'files'} selected
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="bulk-doc-description" className="mb-1 block text-sm font-medium text-content">
                Description (optional)
              </label>
              <textarea
                id="bulk-doc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                placeholder="Optional description for these documents..."
              />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={files.length === 0}>
                Review & Upload
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
