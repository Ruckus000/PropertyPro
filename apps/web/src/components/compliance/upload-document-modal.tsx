"use client";

import React, { useCallback, useRef, useState } from "react";
import { Upload, FileUp } from "lucide-react";
import { Button } from "@propertypro/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertBanner } from "@/components/shared/alert-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { useDocumentCategories } from "@/hooks/use-document-categories";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import {
  RedactionAttestationField,
  categoryRequiresRedactionAttestation,
} from "@/components/documents/redaction-attestation-field";

export interface UploadDocumentModalProps {
  communityId: number;
  defaultTitle: string;
  categoryName: string;
  onUploaded: (documentId: number) => void;
  onClose: () => void;
  /**
   * Ask the server not to link the document to a record itself. For a caller
   * that links it, in `onUploaded`, to the record the person chose: posting a
   * document otherwise links it to the one record it fits, which can be a
   * different record, so one file would fill two.
   */
  skipAutoLink?: boolean;
}

export function UploadDocumentModal({
  communityId,
  defaultTitle,
  categoryName,
  onUploaded,
  onClose,
  skipAutoLink = false,
}: UploadDocumentModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [redactionAttested, setRedactionAttested] = useState(false);
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
  // Financial and meeting records are redaction-sensitive on the server;
  // operations rows file into Contracts / Inspection Reports, which are not.
  const requiresAttestation =
    resolvedCategoryId != null && categoryRequiresRedactionAttestation(resolvedCategoryName);

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
    if (requiresAttestation && !redactionAttested) return;

    try {
      const result = await uploadDocument({
        communityId,
        title: title.trim(),
        categoryId: resolvedCategoryId,
        file,
        redactionAttested,
        ...(skipAutoLink ? { skipAutoLink: true } : {}),
      });
      setWarnings(result.warnings);
      // Clear the file AND the attestation before the early-return below. On a
      // warning this modal stays mounted (it only closes when warnings is
      // empty), so without this the next file inherits a tick the uploader
      // never gave it — and the server writes a document_redaction_attestation
      // row, in an APPEND-ONLY §718.111(12)(c) log, that is simply false.
      setFile(null);
      setRedactionAttested(false);
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
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape, the overlay and the close button all land here; none closes mid-upload.
        if (!open && !isUploading) onClose();
      }}
    >
      <DialogContent size="md" className="gap-0 p-0">
        {/* Header */}
        <DialogHeader className="border-b border-edge-subtle px-4 py-3 pr-14 text-left">
          <DialogTitle className="text-base font-semibold text-content">Upload Document</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a file to upload. It is linked to this record once it uploads.
          </DialogDescription>
        </DialogHeader>

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
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]/20 focus:border-[var(--border-focus)]
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
            // Reachable by keyboard: the file input itself is hidden.
            role="button"
            tabIndex={isUploading ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`
              flex flex-col items-center justify-center gap-2
              rounded-[var(--radius-md)]
              border-2 border-dashed
              py-8 cursor-pointer transition-colors duration-quick
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
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
          </div>
          {/* Outside the drop zone (a control may not hold another) and `hidden`, so it
              is never focused or announced: the drop zone opens it. */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={isUploading || isLoadingCategories || resolvedCategoryId == null}
          />

          {requiresAttestation && (
            <RedactionAttestationField
              id="compliance-upload-redaction-attested"
              checked={redactionAttested}
              onChange={setRedactionAttested}
              disabled={isUploading}
            />
          )}

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
            variant="default"
            size="sm"
            onClick={handleUpload}
            disabled={
              !file
              || !title.trim()
              || isUploading
              || isLoadingCategories
              || resolvedCategoryId == null
              || (requiresAttestation && !redactionAttested)
            }
          >
            {isUploading ? `Uploading ${progress}%` : "Upload & Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
