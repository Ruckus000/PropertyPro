"use client";

import React, { useState } from "react";
import { Button } from "@propertypro/ui";
import { Upload, Link2, Ban, Undo2, Eye } from "lucide-react";
import { DocumentViewerModal } from "@/components/documents/DocumentViewerModal";
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
  const [viewerDocumentId, setViewerDocumentId] = useState<number | null>(null);

  function handleView() {
    if (!item.documentId) return;
    setViewerDocumentId(item.documentId);
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
        {item.documentId ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleView}
              aria-label={`View document for ${item.title}`}
            >
              <Eye size={14} className="mr-1.5" />
              View Document
            </Button>
            <DocumentViewerModal
              open={viewerDocumentId !== null}
              onOpenChange={(open) => {
                if (!open) setViewerDocumentId(null);
              }}
              communityId={communityId}
              documentId={viewerDocumentId}
              fileName={item.title}
              contentTestId="compliance-document-viewer"
            />
          </>
        ) : null}
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
