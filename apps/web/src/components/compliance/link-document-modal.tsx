"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, FileText } from "lucide-react";

interface DocumentRow {
  id: number;
  title: string;
  createdAt?: string;
  mimeType?: string;
}

interface LinkDocumentModalProps {
  communityId: number;
  onSelect: (documentId: number) => void;
  onClose: () => void;
}

export function LinkDocumentModal({ communityId, onSelect, onClose }: LinkDocumentModalProps) {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDocs = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const url = search
          ? `/api/v1/documents/search?communityId=${communityId}&q=${encodeURIComponent(search)}`
          : `/api/v1/documents?communityId=${communityId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        setDocuments((json.data as DocumentRow[]) ?? []);
      } catch {
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    },
    [communityId],
  );

  useEffect(() => {
    fetchDocs("");
    inputRef.current?.focus();
  }, [fetchDocs]);

  function handleSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDocs(value), 300);
  }

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="
          w-full max-w-lg mx-4
          rounded-[var(--radius-lg)] bg-surface-card
          border border-edge-subtle
          shadow-[var(--elevation-e3)]
          animate-in fade-in-0 zoom-in-95 duration-quick
          flex flex-col max-h-[80vh]
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
          <h3 className="text-base font-semibold text-content">Link Document</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 hover:bg-surface-hover transition-colors"
          >
            <X size={16} className="text-content-tertiary" />
          </button>
        </div>

        {/* Search */}
        <div className="relative px-4 py-3 border-b border-edge-subtle">
          <Search size={14} className="absolute left-7 top-1/2 -translate-y-1/2 text-content-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="
              w-full pl-8 pr-3 py-2 text-sm
              rounded-[var(--radius-md)]
              border border-edge
              bg-surface-page
              text-content
              placeholder:text-content-tertiary
              focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/20 focus:border-[var(--border-focus)]
              transition-colors
            "
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-content-tertiary">
              Loading...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText size={24} className="text-content-tertiary mb-2" />
              <p className="text-sm text-content-secondary">No matching documents</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(doc.id)}
                    className="
                      w-full flex items-center gap-3 px-4 py-3
                      text-left transition-colors duration-quick
                      hover:bg-surface-hover
                      focus-visible:outline-none focus-visible:bg-surface-hover
                    "
                  >
                    <FileText size={16} className="text-content-tertiary shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-content truncate">
                        {doc.title}
                      </span>
                      {doc.createdAt && (
                        <span className="text-xs text-content-tertiary">
                          {new Date(doc.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
