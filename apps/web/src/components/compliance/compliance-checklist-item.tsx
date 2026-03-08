"use client";

import React from "react";
import { Card, Badge } from "@propertypro/ui";
import { ComplianceStatusBadge } from "./compliance-badge";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";

export interface ChecklistItemData {
  id: number;
  templateKey: string;
  title: string;
  description?: string | null;
  category: string;
  statuteReference?: string | null;
  documentId?: number | null;
  documentPostedAt?: string | null; // ISO string
  deadline?: string | null; // ISO string
  rollingWindow?: { months: number } | null;
  isConditional?: boolean;
  status: ComplianceStatus;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface ComplianceChecklistItemProps {
  item: ChecklistItemData;
}

export function ComplianceChecklistItem({ item }: ComplianceChecklistItemProps) {
  const deadline = formatDate(item.deadline ?? null);
  const posted = formatDate(item.documentPostedAt ?? null);

  return (
    <Card status={
      item.status === "satisfied"
        ? "success"
        : item.status === "overdue"
        ? "danger"
        : item.status === "unsatisfied"
        ? "warning"
        : "neutral"
    }>
      <Card.Header>
        <div className="flex flex-col gap-0.5">
          <Card.Title>{item.title}</Card.Title>
          <Card.Subtitle>
            {item.statuteReference ? (
              <span className="font-medium text-gray-500 dark:text-gray-400">{item.statuteReference}</span>
            ) : null}
            {item.isConditional && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">
                Conditional
              </span>
            )}
          </Card.Subtitle>
        </div>
        <Card.Actions>
          <ComplianceStatusBadge status={item.status} />
        </Card.Actions>
      </Card.Header>
      <Card.Body className="flex flex-col gap-3">
        {item.description ? (
          <p className="text-sm text-[var(--text-secondary)] dark:text-gray-300 leading-relaxed">{item.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {deadline ? (
            <Badge variant="warning" className="capitalize">Deadline: {deadline}</Badge>
          ) : (
            <Badge variant="neutral">No deadline</Badge>
          )}
          {posted ? (
            <Badge variant="success">Posted: {posted}</Badge>
          ) : (
            <Badge variant="neutral">Not posted</Badge>
          )}
          {item.rollingWindow?.months ? (
            <Badge variant="info">Rolling: {item.rollingWindow.months} mo</Badge>
          ) : null}
        </div>
      </Card.Body>
    </Card>
  );
}

export default ComplianceChecklistItem;
