"use client";

import React, { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@propertypro/ui";
import { Upload, Link2, Ban, Undo2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentViewer } from "@/components/documents/document-viewer";
import type { DocumentListItem } from "@/components/documents/document-list";
import type { ChecklistItemData } from "./compliance-checklist-item";

interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  communityId: number;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}

export function ComplianceItemActions({
  item,
  communityId,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  async function handleView() {
    if (!item.documentId) return;
    setIsLoadingDoc(true);
    setViewError(null);
    try {
      const res = await fetch(
        `/api/v1/documents/${item.documentId}/download?communityId=${communityId}`,
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(errJson?.error?.message ?? "Failed to load document");
      }
      const json = (await res.json()) as {
        data: { url: string; fileName: string; mimeType: string; fileSize: number };
      };
      setViewerDoc({
        id: item.documentId,
        title: item.title,
        description: null,
        fileName: json.data.fileName,
        fileSize: json.data.fileSize,
        mimeType: json.data.mimeType,
        categoryId: null,
        createdAt: item.documentPostedAt ?? new Date().toISOString(),
        uploadedBy: null,
      });
    } catch (err) {
      setViewError(err instanceof Error ? err.message : "Failed to load document");
    } finally {
      setIsLoadingDoc(false);
    }
  }

  if (item.status === "not_applicable") {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={onMarkApplicable}
        aria-label={`Mark ${item.title} as applicable`}
      >
        <Undo2 size={14} className="mr-1.5" />
        Mark Applicable
      </Button>
    );
  }

  if (item.status === "satisfied") {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUnlink}
          className="text-status-danger"
          aria-label={`Unlink document from ${item.title}`}
        >
          Unlink
        </Button>
        {item.documentId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleView}
              disabled={isLoadingDoc}
              aria-label={`View document for ${item.title}`}
            >
              <Eye size={14} className="mr-1.5" />
              {isLoadingDoc ? "Loading…" : "View Document"}
            </Button>
            {viewError && (
              <span
                role="alert"
                className="text-xs text-status-danger ml-2"
              >
                {viewError}
              </span>
            )}
            <DialogPrimitive.Root
              open={viewerDoc !== null}
              onOpenChange={(open) => {
                if (!open) setViewerDoc(null);
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                  className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                />
                <DialogPrimitive.Content
                  data-testid="compliance-document-viewer"
                  className={cn(
                    "fixed left-1/2 top-1/2 z-50 flex h-[min(90vh,920px)] w-[min(98vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-edge bg-surface-page shadow-e3",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                  )}
                >
                  <DialogPrimitive.Title className="sr-only">
                    {viewerDoc?.title ?? "Document preview"}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="sr-only">
                    Preview the document linked to this compliance item.
                  </DialogPrimitive.Description>
                  <div className="min-h-0 flex-1">
                    <DocumentViewer
                      communityId={communityId}
                      document={viewerDoc}
                      onClose={() => setViewerDoc(null)}
                    />
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
          </>
        )}
      </>
    );
  }

  // unsatisfied or overdue
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMarkNA}
        aria-label={`Mark ${item.title} as not applicable`}
      >
        <Ban size={14} className="mr-1.5" />
        N/A
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onLink}
        aria-label={`Link existing document to ${item.title}`}
      >
        <Link2 size={14} className="mr-1.5" />
        Link Existing
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={onUpload}
        aria-label={`Upload document for ${item.title}`}
      >
        <Upload size={14} className="mr-1.5" />
        Upload
      </Button>
    </>
  );
}
