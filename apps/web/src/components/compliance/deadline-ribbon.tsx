"use client";

import React from "react";
import { Zap } from "lucide-react";
import type { ChecklistItemData } from "./compliance-checklist-item";

function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface DeadlineRibbonProps {
  items: ChecklistItemData[];
  onItemClick?: (itemId: number) => void;
}

export function DeadlineRibbon({ items, onItemClick }: DeadlineRibbonProps) {
  // Get upcoming/overdue items with deadlines, sorted by urgency
  const upcoming = items
    .filter((i) => i.deadline && (i.status === "unsatisfied" || i.status === "overdue"))
    .sort((a, b) => {
      const da = new Date(a.deadline!).getTime();
      const db = new Date(b.deadline!).getTime();
      return da - db;
    })
    .slice(0, 4);

  if (upcoming.length === 0) return null;

  const overdueCount = upcoming.filter((i) => i.status === "overdue").length;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card px-4 h-10 overflow-x-auto scrollbar-hide">
      {/* Label */}
      <span className="flex items-center gap-1.5 shrink-0">
        <Zap size={14} className={overdueCount > 0 ? "text-status-danger" : "text-status-warning"} />
        <span className="text-xs font-medium text-content-secondary">
          {upcoming.length} upcoming
        </span>
      </span>

      {/* Separator */}
      <span className="h-4 w-px bg-[var(--border-subtle)] shrink-0" />

      {/* Deadline items */}
      {upcoming.map((item, idx) => {
        const days = daysUntil(item.deadline!);
        const isOverdue = days < 0;
        return (
          <React.Fragment key={item.id}>
            {idx > 0 && (
              <span className="text-content-tertiary text-xs shrink-0">&middot;</span>
            )}
            <button
              type="button"
              onClick={() => onItemClick?.(item.id)}
              className="flex items-center gap-1.5 shrink-0 text-xs hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded"
            >
              <span className="font-medium text-content truncate max-w-[120px]" title={item.title}>
                {item.title}
              </span>
              <span
                className={`tabular-nums font-medium ${
                  isOverdue ? "text-status-danger" : "text-content-tertiary"
                }`}
              >
                {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d`}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
