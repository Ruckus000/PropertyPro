'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import {
  RedactionAttestationField,
  categoryRequiresRedactionAttestation,
} from '@/components/documents/redaction-attestation-field';
import {
  useDocumentUpload,
  type ReplaceFileResult,
  type UploadDocumentResult,
} from '@/hooks/use-document-upload';
import {
  findDuplicate,
  indexLibraryByFileName,
  type LibraryDocumentRef,
} from '@/lib/documents/duplicate-uploads';

interface DocumentUploadAreaProps {
  communityId: number;
  initialCategoryId?: number | null;
  onUploaded?: (result: UploadDocumentResult) => void;
  /**
   * The library as the screen already holds it. When given, a file whose name
   * matches an uploaded document asks whether to replace that document's file
   * or keep both.
   */
  existingDocuments?: readonly LibraryDocumentRef[];
  /** Called after a replace, with the document whose file changed. */
  onReplaced?: (result: ReplaceFileResult) => void;
}

type DuplicateChoice = 'replace' | 'both';

export function DocumentUploadArea({
  communityId,
  initialCategoryId,
  onUploaded,
  existingDocuments,
  onReplaced,
}: DocumentUploadAreaProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(initialCategoryId ?? null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [redactionAttested, setRedactionAttested] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ code: string; message: string }>>([]);
  const [duplicateChoice, setDuplicateChoice] = useState<DuplicateChoice>('replace');

  const { uploadDocument, replaceFile, isUploading, progress, error } = useDocumentUpload();
  const { categories, isLoading, error: categoriesError } = useDocumentCategories(communityId);

  const duplicateIndex = useMemo(
    () => indexLibraryByFileName(existingDocuments ?? []),
    [existingDocuments],
  );
  const duplicate = selectedFile ? findDuplicate(selectedFile.name, duplicateIndex) : null;
  const replacing = duplicate != null && duplicateChoice === 'replace';

  const categoryName = (id: number | null) =>
    categories.find((category) => category.id === id)?.name ?? null;
  // A replacement keeps the existing document's category, so the question is
  // asked about THAT category, not the picker's. The server applies the same
  // category rule whichever attestation it records (public-site or upload) —
  // see `PUT /api/v1/documents/[id]/file` and `publish-document-dialog.tsx`.
  const requiresAttestation = replacing
    ? categoryRequiresRedactionAttestation(categoryName(duplicate.categoryId))
    : // Only ask once a category is chosen — the submit button is already
      // blocked until then, and prompting against no category would read as a bug.
      selectedCategoryId != null
      && categoryRequiresRedactionAttestation(categoryName(selectedCategoryId));

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

  // Both entry points (drop and browse) go through here so the attestation
  // revoke cannot be added to one and forgotten on the other. An attestation is
  // made about a SPECIFIC document, exactly as it is about a specific category:
  // swapping the file revokes it, or the uploader ends up attesting to a
  // document they never looked at.
  const selectFile = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setRedactionAttested(false);
      setDuplicateChoice('replace');
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    },
    [title],
  );

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      selectFile(file);
    }
  }, [selectFile]);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        selectFile(file);
      }
    },
    [selectFile],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      return;
    }

    if (replacing) {
      try {
        const result = await replaceFile({
          communityId,
          documentId: duplicate.id,
          file: selectedFile,
          redactionAttested,
        });
        setSelectedFile(null);
        setRedactionAttested(false);
        toast.success(`File replaced. “${duplicate.title}” keeps its link.`);
        onReplaced?.(result);
      } catch {
        // Error is handled by the hook
      }
      return;
    }

    if (!title.trim()) {
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
        redactionAttested,
      });

      setWarnings(result.warnings);
      setTitle('');
      setDescription('');
      setSelectedFile(null);
      setSelectedCategoryId(initialCategoryId ?? null);
      setCategoryError(null);
      setRedactionAttested(false);

      toast.success('Document uploaded.');
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

      {/* A replacement keeps the existing document's category. */}
      {!replacing && (
        <div>
          <label className="mb-1 block text-sm font-medium text-content-secondary">
            Category
          </label>
          <Select
            value={selectedCategoryId != null ? String(selectedCategoryId) : undefined}
            onValueChange={(value) => {
              setSelectedCategoryId(Number(value));
              setCategoryError(null);
              // An attestation is made about a specific category; changing the
              // category revokes it.
              setRedactionAttested(false);
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
      )}

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
              onClick={() => {
                setSelectedFile(null);
                setRedactionAttested(false);
              }}
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

      {selectedFile && duplicate && (
        <fieldset className="space-y-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
          <legend className="sr-only">A document with this name already exists</legend>
          <p className="text-sm text-content">
            A document named {selectedFile.name} is already in your library: “{duplicate.title}”.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {([
              ['replace', 'Replace the old one', 'Its title, category and link stay the same.'],
              ['both', 'Keep both', 'Upload this as a separate document.'],
            ] as const).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-edge bg-surface-card p-2 text-sm has-[:checked]:border-interactive has-[:checked]:bg-interactive-subtle"
              >
                <input
                  type="radio"
                  name="document-upload-duplicate"
                  value={value}
                  checked={duplicateChoice === value}
                  onChange={() => {
                    setDuplicateChoice(value);
                    // The two choices ask different redaction questions.
                    setRedactionAttested(false);
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium text-content">{label}</span>
                  <span className="block text-xs text-content-secondary">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {selectedFile && !replacing && (
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
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 ring-focus"
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
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 ring-focus"
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

      {requiresAttestation && (
        <RedactionAttestationField
          id="document-upload-area-redaction-attested"
          checked={redactionAttested}
          onChange={setRedactionAttested}
          disabled={isUploading}
        />
      )}

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <button
        type="submit"
        disabled={
          isUploading
          || !selectedFile
          || (!replacing && (!title.trim() || selectedCategoryId == null))
          || (requiresAttestation && !redactionAttested)
        }
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : replacing ? 'Replace File' : 'Upload Document'}
      </button>
    </form>
  );
}
