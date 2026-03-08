"use client";

import React from "react";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";

export type StatusFilter = "all" | ComplianceStatus;

interface FilterPillsProps {
  active: StatusFilter;
  counts: {
    satisfied: number;
    unsatisfied: number;
    overdue: number;
    not_applicable: number;
  };
  total: number;
  onChange: (filter: StatusFilter) => void;
}

const PILLS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "unsatisfied", label: "Pending" },
  { key: "satisfied", label: "Satisfied" },
  { key: "not_applicable", label: "N/A" },
];

export function ComplianceFilterPills({ active, counts, total, onChange }: FilterPillsProps) {
  function countFor(key: StatusFilter): number {
    if (key === "all") return total;
    return counts[key] ?? 0;
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {PILLS.map(({ key, label }) => {
        const count = countFor(key);
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            disabled={count === 0 && !isActive}
            className={`
              inline-flex items-center gap-1.5 rounded-[var(--radius-full)]
              px-3 py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium
              transition-colors duration-150 whitespace-nowrap
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]
              disabled:cursor-not-allowed
              ${isActive
                ? "bg-[var(--text-primary)] text-[var(--surface-page)]"
                : `bg-transparent text-[var(--text-secondary)]
                   border border-[var(--border-subtle)]
                   hover:bg-[var(--surface-hover)]
                   ${count === 0 ? "opacity-50" : ""}`
              }
            `}
          >
            {label}
            <span className={isActive ? "font-normal opacity-80" : "font-normal tabular-nums"}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
