/**
 * StatusPills - Aggregated status summary row (Phase 2.1)
 *
 * Pattern:
 * - Count items by status
 * - Render as a centered horizontal row of pill badges
 * - Optionally make pills clickable to drive filtering/navigation
 */

import React from "react";
import { primitiveSpace } from "../tokens";
import { Stack } from "../primitives";
import { Badge } from "../components";

export type StatusPillsKey = "overdue" | "pending" | "compliant";

export type StatusCounts = {
  overdue: number;
  pending: number;
  compliant: number;
};

export function countStatuses<T extends { status: string }>(items: T[]): StatusCounts {
  const overdue = items.filter((i) => i.status === "overdue").length;
  const pending = items.filter((i) => i.status === "pending").length;
  const compliant = items.filter((i) => i.status === "compliant" || i.status === "completed").length;
  return { overdue, pending, compliant };
}

export interface StatusPillsProps {
  counts: StatusCounts;
  onSelect?: (key: StatusPillsKey) => void;
}

export function StatusPills({ counts, onSelect }: StatusPillsProps) {
  const Pill = ({
    keyName,
    children,
    variant,
    ariaLabel,
  }: {
    keyName: StatusPillsKey;
    children: React.ReactNode;
    variant: React.ComponentProps<typeof Badge>["variant"];
    ariaLabel: string;
  }) => {
    if (!onSelect) return <Badge variant={variant}>{children}</Badge>;

    return (
      <button
        type="button"
        onClick={() => onSelect(keyName)}
        style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
        aria-label={ariaLabel}
      >
        <Badge variant={variant}>{children}</Badge>
      </button>
    );
  };

  return (
    <Stack direction="row" align="center" justify="center" gap={primitiveSpace[2]} style={{ flexWrap: "wrap" }}>
      {counts.overdue > 0 && (
        <Pill
          keyName="overdue"
          variant="danger"
          ariaLabel={`${counts.overdue} Overdue`}
        >
          {counts.overdue} Overdue
        </Pill>
      )}
      {counts.pending > 0 && (
        <Pill
          keyName="pending"
          variant="warning"
          ariaLabel={`${counts.pending} Due Soon`}
        >
          {counts.pending} Due Soon
        </Pill>
      )}
      <Pill
        keyName="compliant"
        variant="success"
        ariaLabel={`${counts.compliant} Complete`}
      >
        {counts.compliant} Complete
      </Pill>
    </Stack>
  );
}

export default StatusPills;

