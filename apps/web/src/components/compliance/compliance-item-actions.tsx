"use client";

import React from "react";
import { Button } from "@propertypro/ui";
import { Upload, Link2, Ban, Undo2, ExternalLink } from "lucide-react";
import type { ChecklistItemData } from "./compliance-checklist-item";

interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}

export function ComplianceItemActions({
  item,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
  if (item.status === "not_applicable") {
    return (
      <Button variant="secondary" size="sm" onClick={onMarkApplicable}>
        <Undo2 size={14} className="mr-1.5" />
        Mark Applicable
      </Button>
    );
  }

  if (item.status === "satisfied") {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={onUnlink} className="text-[var(--status-danger)]">
          Unlink
        </Button>
        {item.documentId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`/documents/${item.documentId}`, "_blank")}
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
      <Button variant="ghost" size="sm" onClick={onMarkNA}>
        <Ban size={14} className="mr-1.5" />
        N/A
      </Button>
      <Button variant="secondary" size="sm" onClick={onLink}>
        <Link2 size={14} className="mr-1.5" />
        Link Existing
      </Button>
      <Button variant="primary" size="sm" onClick={onUpload}>
        <Upload size={14} className="mr-1.5" />
        Upload
      </Button>
    </>
  );
}
