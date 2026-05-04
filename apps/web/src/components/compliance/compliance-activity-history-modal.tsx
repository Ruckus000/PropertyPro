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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplianceActivityHistoryModal({
  communityId,
  open,
  onOpenChange,
}: ComplianceActivityHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
        data-testid="compliance-activity-history-modal"
      >
        <DialogHeader className="shrink-0 space-y-2 px-6 pb-4 pt-6 text-left">
          <DialogTitle>Activity history</DialogTitle>
          <DialogDescription>
            All compliance actions for this community.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {open && <AuditTrailViewer communityId={communityId} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
