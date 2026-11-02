"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuditTrailViewer } from "@/components/audit/AuditTrailViewer";

export interface ComplianceActivityHistoryModalProps {
  communityId: number;
  /** The community's time zone, so times match the audit trail page. */
  timeZone?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplianceActivityHistoryModal({
  communityId,
  timeZone = "America/New_York",
  open,
  onOpenChange,
}: ComplianceActivityHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        resizable
        className="flex flex-col gap-0 overflow-hidden p-0"
        data-testid="compliance-activity-history-modal"
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pb-4 pt-6 text-left">
          <DialogTitle>Activity history</DialogTitle>
          <DialogDescription>
            Everything recorded in this community. Search for a document to see its history.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {open && <AuditTrailViewer communityId={communityId} timeZone={timeZone} syncUrl={false} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
