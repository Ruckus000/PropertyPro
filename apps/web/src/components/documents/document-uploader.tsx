'use client';

import { useState, type FormEvent } from 'react';
import { useDocumentUpload } from '@/hooks/useDocumentUpload';

interface DocumentUploaderProps {
  communityId: number;
  onUploaded?: (document: Record<string, unknown>) => void;
}

export function DocumentUploader({ communityId, onUploaded }: DocumentUploaderProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { uploadDocument, isUploading, progress, error } = useDocumentUpload();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      return;
    }

    const created = await uploadDocument({
      communityId,
      title,
      description,
      file: selectedFile,
    });

    setTitle('');
    setDescription('');
    setSelectedFile(null);

    onUploaded?.(created);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-gray-200 p-4">
      <h2 className="text-lg font-semibold text-gray-900">Upload document</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Title</span>
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          rows={3}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">File</span>
        <input
          type="file"
          required
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-700"
        />
      </label>

      {isUploading ? (
        <div className="space-y-1">
          <p className="text-sm text-gray-700">Uploading... {progress}%</p>
          <div className="h-2 w-full rounded bg-gray-200">
            <div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isUploading || !selectedFile}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : 'Upload document'}
      </button>
    </form>
  );
}
