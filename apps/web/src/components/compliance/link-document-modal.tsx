"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, FileText } from "lucide-react";
import { ReceivedOnField } from "./received-on-field";
import { receivedOnToIso, toDateInputValue } from "@/lib/compliance/received-on-input";

interface DocumentRow {
  id: number;
  title: string;
  createdAt?: string;
  mimeType?: string;
}

interface LinkDocumentModalProps {
  communityId: number;
  /** `receivedAt`: when the association received or created the record (H-2). */
  onSelect: (documentId: number, receivedAt: string) => void;
  onClose: () => void;
  /** The dialog title. */
  title?: string;
  /** The date field's label and hint, for a record whose date has its own name. */
  dateLabel?: string;
  dateHint?: string;
}

export function LinkDocumentModal({
  communityId,
  onSelect,
  onClose,
  title = "Link Document",
  dateLabel,
  dateHint,
}: LinkDocumentModalProps) {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [receivedOn, setReceivedOn] = useState(() => toDateInputValue(new Date()));
  const receivedAt = receivedOnToIso(receivedOn);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDocs = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const url = search
          ? `/api/v1/documents/search?communityId=${communityId}&q=${encodeURIComponent(search)}`
          : `/api/v1/documents?communityId=${communityId}&pageSize=100`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { data?: { data?: DocumentRow[] } | DocumentRow[] };
        const innerData = json.data;
        const rows = Array.isArray(innerData)
          ? innerData
          : innerData?.data ?? [];
        setDocuments(rows as DocumentRow[]);
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
          <h3 className="text-base font-semibold text-content">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[var(--radius-sm)] p-1 hover:bg-surface-hover transition-colors"
          >
            <X size={16} className="text-content-tertiary" aria-hidden="true" />
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
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]/20 focus:border-[var(--border-focus)]
              transition-colors
            "
          />
        </div>

        <div className="px-4 py-3 border-b border-edge-subtle">
          <ReceivedOnField
            id="compliance-link-received-on"
            value={receivedOn}
            onChange={setReceivedOn}
            {...(dateLabel ? { label: dateLabel } : {})}
            hint={
              dateHint ??
              "The 30-day posting window starts on this date. A date can correct one already on the file only to an earlier day."
            }
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
                    onClick={() => {
                      if (receivedAt) onSelect(doc.id, receivedAt);
                    }}
                    disabled={!receivedAt}
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
