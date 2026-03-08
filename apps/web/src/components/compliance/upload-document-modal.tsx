"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, FileUp } from "lucide-react";
import { Button } from "@propertypro/ui";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

interface UploadDocumentModalProps {
  communityId: number;
  defaultTitle: string;
  onUploaded: (documentId: number) => void;
  onClose: () => void;
}

export function UploadDocumentModal({
  communityId,
  defaultTitle,
  onUploaded,
  onClose,
}: UploadDocumentModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isUploading, progress, error, uploadDocument } = useDocumentUpload();

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
    if (!file || !title.trim()) return;

    try {
      const result = await uploadDocument({
        communityId,
        title: title.trim(),
        file,
      });
      // Safely extract the document id from the result
      const resultObj = result as Record<string, unknown> | null | undefined;
      const docId = typeof resultObj?.id === 'number' ? resultObj.id : null;
      if (docId) {
        onUploaded(docId);
        onClose();
      }
      // If no docId, keep modal open so user sees something went wrong
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        className="
          w-full max-w-lg mx-4
          rounded-[var(--radius-lg)] bg-[var(--surface-card)]
          border border-[var(--border-subtle)]
          shadow-[var(--elevation-e3)]
          animate-in fade-in-0 zoom-in-95 duration-200
          flex flex-col
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 id="upload-modal-title" className="text-base font-semibold text-[var(--text-primary)]">Upload Document</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close"
            className="rounded-[var(--radius-sm)] p-1 hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
          >
            <X size={16} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Title input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload-title" className="text-xs font-medium text-[var(--text-secondary)]">
              Title
            </label>
            <input
              id="upload-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              className="
                w-full px-3 py-2 text-sm
                rounded-[var(--radius-md)]
                border border-[var(--border-default)]
                bg-[var(--surface-page)]
                text-[var(--text-primary)]
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
              py-8 cursor-pointer transition-colors duration-150
              ${dragOver
                ? "border-[var(--border-focus)] bg-[var(--status-info-bg)]"
                : file
                ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)]"
                : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              }
              ${isUploading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            {file ? (
              <>
                <FileUp size={24} className="text-[var(--status-success)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{file.name}</span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </>
            ) : (
              <>
                <Upload size={24} className="text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-secondary)]">
                  Drop a file here or click to browse
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={isUploading}
            />
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="bg-[var(--status-info)] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-[var(--status-danger)]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            disabled={!file || !title.trim() || isUploading}
          >
            {isUploading ? `Uploading ${progress}%` : "Upload & Link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
