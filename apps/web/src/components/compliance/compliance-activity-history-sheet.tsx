"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AuditTrailViewer } from "@/components/audit/AuditTrailViewer";

export interface ComplianceActivityHistorySheetProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplianceActivityHistorySheet({
  communityId,
  open,
  onOpenChange,
}: ComplianceActivityHistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl lg:max-w-2xl"
        data-testid="compliance-activity-history-sheet"
      >
        <SheetHeader className="mb-4">
          <SheetTitle>Activity history</SheetTitle>
          <SheetDescription>
            All compliance actions for this community.
          </SheetDescription>
        </SheetHeader>
        {open && <AuditTrailViewer communityId={communityId} />}
      </SheetContent>
    </Sheet>
  );
}
