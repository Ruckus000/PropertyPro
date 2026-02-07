/**
 * ComplianceHero - Composed "hero" section for compliance (Phase 2.1)
 *
 * Layout order (per wireframe):
 * 1) Alert banner (only if overdue)
 * 2) HeroMetric
 * 3) StatusPills row
 * 4) (Tabs follow outside this pattern)
 */

import React from "react";
import { primitiveSpace, StatusVariant } from "../tokens";
import { Stack } from "../primitives";
import { AlertBanner } from "./AlertBanner";
import { HeroMetric } from "../components/Metrics/HeroMetric";
import { StatusPills, StatusCounts, StatusPillsKey } from "./StatusPills";

export interface ComplianceHeroProps {
  compliancePct: number;
  totalCount: number;
  compliantCount: number;
  overdueCount: number;
  pendingCount: number;
  trend?: "up" | "down" | "flat";
  trendValue?: number;
  onPillSelect?: (key: StatusPillsKey) => void;
  alert?: {
    title: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
  };
}

function statusFromPct(pct: number): StatusVariant {
  return pct >= 100 ? "success" : pct >= 80 ? "brand" : pct >= 50 ? "warning" : "danger";
}

export function ComplianceHero({
  compliancePct,
  totalCount,
  compliantCount,
  overdueCount,
  pendingCount,
  trend,
  trendValue,
  onPillSelect,
  alert,
}: ComplianceHeroProps) {
  const counts: StatusCounts = {
    overdue: overdueCount,
    pending: pendingCount,
    compliant: compliantCount,
  };

  return (
    <Stack gap={primitiveSpace[4]}>
      {overdueCount > 0 && alert && (
        <AlertBanner
          status="danger"
          title={alert.title}
          description={alert.description}
          action={alert.action}
        />
      )}

      <HeroMetric
        value={compliancePct}
        format="percent"
        label="Overall Compliance"
        context={
          compliancePct === 100
            ? "You're fully compliant!"
            : `${totalCount - compliantCount} of ${totalCount} items need attention`
        }
        trend={trend}
        trendValue={trendValue}
        status={statusFromPct(compliancePct)}
      />

      <StatusPills counts={counts} onSelect={onPillSelect} />
    </Stack>
  );
}

export default ComplianceHero;

