'use client';

import { useState, type FormEvent } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import {
  useDocumentUpload,
  type UploadDocumentResult,
} from '@/hooks/useDocumentUpload';

interface DocumentUploaderProps {
  communityId: number;
  categoryId: number | null;
  categoryName?: string;
  onUploaded?: (result: UploadDocumentResult) => void;
}

export function DocumentUploader({
  communityId,
  categoryId,
  categoryName,
  onUploaded,
}: DocumentUploaderProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [warnings, setWarnings] = useState<Array<{ code: string; message: string }>>([]);

  const { uploadDocument, isUploading, progress, error } = useDocumentUpload();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile || categoryId == null) {
      return;
    }

    const result = await uploadDocument({
      communityId,
      title,
      description,
      categoryId,
      file: selectedFile,
    });

    setWarnings(result.warnings);
    setTitle('');
    setDescription('');
    setSelectedFile(null);

    onUploaded?.(result);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-edge p-4">
      <h2 className="text-lg font-semibold text-content">Upload document</h2>

      {warnings.length > 0 ? (
        <AlertBanner
          status="warning"
          title="Uploaded with warnings"
          description={warnings.map((warning) => warning.message).join(' ')}
        />
      ) : null}

      {categoryName ? (
        <p className="text-sm text-content-tertiary">
          Category: <span className="font-medium text-content-secondary">{categoryName}</span>
        </p>
      ) : null}

      {categoryId == null ? (
        <AlertBanner
          status="danger"
          title="Category mapping required"
          description="This upload is blocked until the checklist item can be matched to a document category."
        />
      ) : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Title</span>
        <input
          id="document-uploader-title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Description</span>
        <textarea
          id="document-uploader-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
          rows={3}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">File</span>
        <input
          type="file"
          required
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-content-secondary"
        />
      </label>

      {isUploading ? (
        <div className="space-y-1">
          <p className="text-sm text-content-secondary">Uploading... {progress}%</p>
          <div className="h-2 w-full rounded bg-surface-muted">
            <div className="h-2 rounded bg-interactive" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-status-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={isUploading || !selectedFile || categoryId == null}
        className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white hover:bg-interactive-hover disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : 'Upload document'}
      </button>
    </form>
  );
}
