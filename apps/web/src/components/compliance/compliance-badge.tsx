"use client";

import React from "react";
import { StatusBadge } from "@propertypro/ui";
import type { StatusBadgeProps } from "@propertypro/ui";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";

/**
 * Maps compliance engine status values to UI status keys.
 * Colors per acceptance criteria:
 * - satisfied → green (success)
 * - overdue → red (danger)
 * - unsatisfied → yellow (warning)
 * - not_applicable → gray (neutral)
 */
function mapComplianceToUiStatus(status: ComplianceStatus): StatusBadgeProps["status"] {
  switch (status) {
    case "satisfied":
      return "completed"; // success variant
    case "overdue":
      return "overdue"; // danger variant
    case "unsatisfied":
      return "pending"; // warning variant
    case "not_applicable":
    default:
      return "neutral"; // gray
  }
}

export interface ComplianceStatusBadgeProps {
  status: ComplianceStatus;
  showLabel?: boolean;
  className?: string;
}

export function ComplianceStatusBadge({ status, showLabel = true, className }: ComplianceStatusBadgeProps) {
  return (
    <StatusBadge status={mapComplianceToUiStatus(status)} showLabel={showLabel} className={className} />
  );
}

export default ComplianceStatusBadge;
