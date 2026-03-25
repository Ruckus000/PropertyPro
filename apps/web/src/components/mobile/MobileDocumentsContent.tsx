"use client";

import { useState, useMemo } from "react";
import { FileText, Search } from "lucide-react";
import { AlertBanner } from "@/components/shared/alert-banner";
import { cn } from "@/lib/utils";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import {
  PageTransition,
  StaggerChildren,
  StaggerItem,
} from "@/components/motion";

// ── Types ───────────────────────────────────────────

interface SerializedDocument {
  id: number;
  title: string;
  fileName: string;
  mimeType: string;
  category: string;
  createdAt: string;
  requiresSignature: boolean;
}

interface MobileDocumentsContentProps {
  communityId: number;
  documents: SerializedDocument[];
  timezone: string;
}

// ── Helpers ─────────────────────────────────────────

function formatDate(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase();
  return ext ?? "FILE";
}

// ── Component ───────────────────────────────────────

export function MobileDocumentsContent({
  communityId,
  documents,
  timezone,
}: MobileDocumentsContentProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [actionError, setActionError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(documents.map((d) => d.category))).sort();
    return ["All", ...unique];
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        !search || doc.title.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        activeCategory === "All" || doc.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, search, activeCategory]);

  const showFilters = categories.length > 2;
  const showSearchAndFilters = documents.length > 0;

  function isPreviewable(mimeType: string): boolean {
    return mimeType.includes("pdf") || mimeType.includes("image");
  }

  async function handleOpen(doc: SerializedDocument): Promise<void> {
    setActionError(null);

    try {
      const response = await fetch(`/api/v1/documents/${doc.id}/download?communityId=${communityId}`);
      if (!response.ok) {
        throw new Error("Unable to open document");
      }

      const body = (await response.json()) as { data: { url: string } };
      window.location.assign(body.data.url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to open document");
    }
  }

  function handleDownload(doc: SerializedDocument): void {
    setActionError(null);
    window.location.assign(`/api/v1/documents/${doc.id}/download?communityId=${communityId}&attachment=true`);
  }

  return (
    <PageTransition>
      <div className="flex flex-col pb-6">
        <MobileBackHeader title="Documents" />

        {actionError && (
          <div className="px-4 pt-4">
            <AlertBanner
              status="warning"
              title="Document action unavailable"
              description={actionError}
            />
          </div>
        )}

        {/* ── Search + Filters ── */}
        {showSearchAndFilters && (
          <div className="flex flex-col gap-3 px-4 pt-4">
            {/* Search bar */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full rounded-[10px] border border-stone-200 bg-stone-100 py-2.5 pl-9 pr-3",
                  "text-sm text-stone-900 placeholder:text-stone-400",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                )}
              />
            </div>

            {/* Category filter pills */}
            {showFilters && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
                {categories.map((cat) => {
                  const isActive = cat === activeCategory;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={cn(
                        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2",
                        isActive
                          ? "bg-stone-900 text-white"
                          : "border border-stone-200 bg-stone-100 text-stone-500",
                      )}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Document List ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pt-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
              <FileText size={28} className="text-stone-400" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-stone-900">
              No documents yet
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Documents will appear here when posted.
            </p>
          </div>
        ) : (
          <StaggerChildren>
            <ul className="mt-2">
              {filtered.map((doc) => (
                <StaggerItem key={doc.id}>
                  <li className="flex items-start gap-3 border-b border-stone-100 px-4 py-4">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        doc.requiresSignature ? "bg-blue-50" : "bg-stone-100",
                      )}
                    >
                      <FileText
                        size={18}
                        className={cn(
                          doc.requiresSignature
                            ? "text-blue-600"
                            : "text-stone-400",
                        )}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium text-stone-900">
                        {doc.title}
                      </span>
                      <span className="mt-0.5 text-xs text-stone-400">
                        {doc.category} &middot; {getFileType(doc.fileName)} &middot;{" "}
                        {formatDate(doc.createdAt, timezone)}
                      </span>
                      {doc.requiresSignature && (
                        <span className="mt-1.5 inline-flex w-fit rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                          Signature Required
                        </span>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isPreviewable(doc.mimeType) && (
                          <button
                            type="button"
                            onClick={() => void handleOpen(doc)}
                            data-testid={`mobile-document-open-${doc.id}`}
                            className="min-h-11 rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700"
                          >
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          data-testid={`mobile-document-download-${doc.id}`}
                          className="min-h-11 rounded-full bg-stone-900 px-4 text-sm font-medium text-white"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  </li>
                </StaggerItem>
              ))}
            </ul>
          </StaggerChildren>
        )}
      </div>
    </PageTransition>
  );
}
