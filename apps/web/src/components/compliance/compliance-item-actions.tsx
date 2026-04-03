"use client";

import React from "react";
import { Button } from "@propertypro/ui";
import { Upload, Link2, Ban, Undo2, ExternalLink } from "lucide-react";
import type { ChecklistItemData } from "./compliance-checklist-item";

interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  itemTitle: string;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}

export function ComplianceItemActions({
  item,
  itemTitle,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
  if (item.status === "not_applicable") {
    return (
      <Button variant="secondary" size="sm" onClick={onMarkApplicable} aria-label={`Mark ${itemTitle} as applicable`}>
        <Undo2 size={14} className="mr-1.5" />
        Mark Applicable
      </Button>
    );
  }

  if (item.status === "satisfied") {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={onUnlink} className="text-status-danger" aria-label={`Unlink document from ${itemTitle}`}>
          Unlink
        </Button>
        {item.documentId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`/documents/${item.documentId}`, "_blank")}
            aria-label={`View document for ${itemTitle}`}
          >
            <ExternalLink size={14} className="mr-1.5" />
            View Document
          </Button>
        )}
      </>
    );
  }

  // unsatisfied or overdue
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onMarkNA} aria-label={`Mark ${itemTitle} as not applicable`}>
        <Ban size={14} className="mr-1.5" />
        N/A
      </Button>
      <Button variant="secondary" size="sm" onClick={onLink} aria-label={`Link existing document to ${itemTitle}`}>
        <Link2 size={14} className="mr-1.5" />
        Link Existing
      </Button>
      <Button variant="primary" size="sm" onClick={onUpload} aria-label={`Upload document for ${itemTitle}`}>
        <Upload size={14} className="mr-1.5" />
        Upload
      </Button>
    </>
  );
}
