'use client';

import { useCallback, useEffect, useState, type DragEvent, type ChangeEvent } from 'react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';
import {
  useDocumentUpload,
  type UploadDocumentResult,
} from '@/hooks/useDocumentUpload';

interface DocumentUploadAreaProps {
  communityId: number;
  initialCategoryId?: number | null;
  onUploaded?: (result: UploadDocumentResult) => void;
}

export function DocumentUploadArea({
  communityId,
  initialCategoryId,
  onUploaded,
}: DocumentUploadAreaProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(initialCategoryId ?? null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Array<{ code: string; message: string }>>([]);

  const { uploadDocument, isUploading, progress, error } = useDocumentUpload();
  const { categories, isLoading, error: categoriesError } = useDocumentCategories(communityId);

  useEffect(() => {
    if (initialCategoryId != null && categories.some((category) => category.id === initialCategoryId)) {
      setSelectedCategoryId(initialCategoryId);
      setCategoryError(null);
    }
  }, [initialCategoryId, categories]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [title]);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    },
    [title],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile || !title.trim()) {
      return;
    }
    if (selectedCategoryId == null) {
      setCategoryError('Choose a category before uploading this document.');
      return;
    }

    try {
      const result = await uploadDocument({
        communityId,
        title: title.trim(),
        description: description.trim() || null,
        categoryId: selectedCategoryId,
        file: selectedFile,
      });

      setWarnings(result.warnings);
      setTitle('');
      setDescription('');
      setSelectedFile(null);
      setSelectedCategoryId(initialCategoryId ?? null);
      setCategoryError(null);

      onUploaded?.(result);
    } catch {
      // Error is handled by the hook
    }
  };

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading upload settings...</p>;
  }

  if (categoriesError) {
    return (
      <AlertBanner
        status="danger"
        title="Unable to load categories"
        description={categoriesError}
      />
    );
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="Create a category before uploading"
        description="Document uploads are blocked until this community has at least one document category."
        size="sm"
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {warnings.length > 0 && (
        <AlertBanner
          status="warning"
          title="Uploaded with warnings"
          description={warnings.map((warning) => warning.message).join(' ')}
        />
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-content-secondary">
          Category
        </label>
        <Select
          value={selectedCategoryId != null ? String(selectedCategoryId) : undefined}
          onValueChange={(value) => {
            setSelectedCategoryId(Number(value));
            setCategoryError(null);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-content-tertiary">
          Residents will only see documents that match their allowed category access.
        </p>
        {categoryError && (
          <p className="mt-1 text-xs text-status-danger">{categoryError}</p>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? 'border-interactive bg-interactive-subtle'
            : 'border-edge-strong bg-surface-page hover:border-edge-strong'
        }`}
      >
        {selectedFile ? (
          <div className="text-center">
            <p className="font-medium text-content">{selectedFile.name}</p>
            <p className="text-sm text-content-tertiary">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="mt-2 text-sm text-status-danger hover:text-status-danger"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <svg
              className="mb-3 h-10 w-10 text-content-disabled"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-content-secondary">
              Drag and drop a file, or{' '}
              <label className="cursor-pointer text-content-link hover:text-interactive">
                browse
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                />
              </label>
            </p>
            <p className="mt-1 text-xs text-content-tertiary">
              PDF, DOCX, PNG, JPG up to 50MB
            </p>
          </>
        )}
      </div>

      {selectedFile && (
        <>
          <div>
            <label htmlFor="document-upload-title" className="mb-1 block text-sm font-medium text-content-secondary">
              Title
            </label>
            <input
              id="document-upload-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
              placeholder="Document title"
            />
          </div>

          <div>
            <label htmlFor="document-upload-description" className="mb-1 block text-sm font-medium text-content-secondary">
              Description (optional)
            </label>
            <textarea
              id="document-upload-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
              placeholder="Brief description of the document"
            />
          </div>
        </>
      )}

      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-content-secondary">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-interactive transition-all duration-standard"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <button
        type="submit"
        disabled={isUploading || !selectedFile || !title.trim() || selectedCategoryId == null}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : 'Upload Document'}
      </button>
    </form>
  );
}
