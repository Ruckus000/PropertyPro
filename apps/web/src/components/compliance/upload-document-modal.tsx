"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, FileUp } from "lucide-react";
import { Button } from "@propertypro/ui";
import { AlertBanner } from "@/components/shared/alert-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { useDocumentCategories } from "@/hooks/useDocumentCategories";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

interface UploadDocumentModalProps {
  communityId: number;
  defaultTitle: string;
  categoryName: string;
  onUploaded: (documentId: number) => void;
  onClose: () => void;
}

export function UploadDocumentModal({
  communityId,
  defaultTitle,
  categoryName,
  onUploaded,
  onClose,
}: UploadDocumentModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ code: string; message: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isUploading, progress, error, uploadDocument } = useDocumentUpload();
  const {
    categories,
    isLoading: isLoadingCategories,
    error: categoriesError,
    resolveCategoryId,
  } = useDocumentCategories(communityId);
  const resolvedCategoryId = resolveCategoryId(categoryName);
  const resolvedCategoryName = categories.find((category) => category.id === resolvedCategoryId)?.name ?? categoryName;

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isUploading) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, isUploading]);

  function handleFileSelect(files: FileList | null) {
    const first = files?.[0];
    if (first) {
      setFile(first);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, []);

  async function handleUpload() {
    if (!file || !title.trim() || resolvedCategoryId == null) return;

    try {
      const result = await uploadDocument({
        communityId,
        title: title.trim(),
        categoryId: resolvedCategoryId,
        file,
      });
      setWarnings(result.warnings);
      // The result should include the document id
      const docId = (result.document as Record<string, unknown>).id as number;
      if (docId) {
        onUploaded(docId);
      }
      if (result.warnings.length === 0) {
        onClose();
      }
    } catch {
      // error state is handled by the hook
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
    >
      <div
        className="
          w-full max-w-lg mx-4
          rounded-[var(--radius-lg)] bg-surface-card
          border border-edge-subtle
          shadow-[var(--elevation-e3)]
          animate-in fade-in-0 zoom-in-95 duration-quick
          flex flex-col
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
          <h3 className="text-base font-semibold text-content">Upload Document</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="rounded-[var(--radius-sm)] p-1 hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <X size={16} className="text-content-tertiary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {warnings.length > 0 && (
            <AlertBanner
              status="warning"
              title="Uploaded with warnings"
              description={warnings.map((warning) => warning.message).join(' ')}
            />
          )}

          {isLoadingCategories && (
            <p className="text-sm text-content-secondary">Loading upload settings...</p>
          )}

          {!isLoadingCategories && categoriesError && (
            <AlertBanner
              status="danger"
              title="Unable to load categories"
              description={categoriesError}
            />
          )}

          {!isLoadingCategories && !categoriesError && categories.length === 0 && (
            <EmptyState
              icon="file-text"
              title="Create a category before uploading"
              description="Compliance uploads are blocked until this community has at least one document category."
              size="sm"
            />
          )}

          {!isLoadingCategories && !categoriesError && categories.length > 0 && resolvedCategoryId == null && (
            <AlertBanner
              status="danger"
              title="Category mapping required"
              description={`This checklist item could not be matched to a document category (${categoryName}).`}
            />
          )}

          {!isLoadingCategories && !categoriesError && resolvedCategoryId != null && (
            <p className="text-sm text-content-tertiary">
              Category: <span className="font-medium text-content-secondary">{resolvedCategoryName}</span>
            </p>
          )}

          {/* Title input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload-title" className="text-xs font-medium text-content-secondary">
              Title
            </label>
            <input
              id="upload-title"
              type="text"
              value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading || isLoadingCategories || resolvedCategoryId == null}
            className="
                w-full px-3 py-2 text-sm
                rounded-[var(--radius-md)]
                border border-edge
                bg-surface-page
                text-content
                focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/20 focus:border-[var(--border-focus)]
                transition-colors disabled:opacity-50
              "
            />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center gap-2
              rounded-[var(--radius-md)]
              border-2 border-dashed
              py-8 cursor-pointer transition-colors duration-quick
              ${dragOver
                ? "border-[var(--border-focus)] bg-[var(--status-info-bg)]"
                : file
                ? "border-status-success-border bg-status-success-bg"
                : "border-edge hover:border-edge-strong hover:bg-surface-hover"
              }
              ${isUploading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            {file ? (
              <>
                <FileUp size={24} className="text-status-success" />
                <span className="text-sm font-medium text-content">{file.name}</span>
                <span className="text-xs text-content-tertiary">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </>
            ) : (
              <>
                <Upload size={24} className="text-content-tertiary" />
                <span className="text-sm text-content-secondary">
                  Drop a file here or click to browse
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={isUploading || isLoadingCategories || resolvedCategoryId == null}
            />
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="bg-[var(--status-info)] transition-all duration-standard"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-status-danger">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-edge-subtle">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            disabled={!file || !title.trim() || isUploading || isLoadingCategories || resolvedCategoryId == null}
          >
            {isUploading ? `Uploading ${progress}%` : "Upload & Link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
