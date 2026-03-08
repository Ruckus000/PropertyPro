"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Badge } from "@propertypro/ui";
import { ComplianceChecklistItem, type ChecklistItemData } from "./compliance-checklist-item";
import { ComplianceStatusBadge } from "./compliance-badge";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";
import { generateChecklistPdf } from "@/lib/utils/pdf-export";
import {
  Clock,
  Filter,
  FileDown,
  ChevronDown,
  ChevronRight,
  Shield,
  XCircle,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────

export interface ComplianceDashboardProps {
  communityId: number;
}

export interface ChecklistFilters {
  status: "all" | ComplianceStatus;
  category: "all" | string;
}

const CATEGORY_LABELS: Record<string, string> = {
  governing_documents: "Governing Documents",
  financial_records: "Financial Records",
  meeting_records: "Meeting Records",
  insurance: "Insurance",
  operations: "Operations",
};

function formatCategoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function filterChecklistItems(
  items: ChecklistItemData[],
  filters: ChecklistFilters,
): ChecklistItemData[] {
  return items.filter((item) => {
    const statusOk = filters.status === "all" || item.status === filters.status;
    const categoryOk = filters.category === "all" || item.category === filters.category;
    return statusOk && categoryOk;
  });
}

async function fetchChecklist(communityId: number): Promise<ChecklistItemData[]> {
  const res = await fetch(`/api/v1/compliance?communityId=${communityId}`);
  if (!res.ok) {
    throw new Error(`Failed to load checklist (${res.status})`);
  }
  const json = (await res.json()) as { data: ChecklistItemData[] };
  return json.data ?? [];
}

function uniqueCategories(items: ChecklistItemData[]): string[] {
  const set = new Set<string>();
  for (const i of items) set.add(i.category);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function toPdfItems(items: ChecklistItemData[]) {
  return items.map((i) => ({
    title: i.title,
    category: i.category,
    status: i.status,
    deadline: i.deadline ?? null,
  }));
}

function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDeadlineDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Group items by category, preserving a defined order. */
function groupByCategory(items: ChecklistItemData[]): Map<string, ChecklistItemData[]> {
  const order = ["governing_documents", "financial_records", "meeting_records", "insurance", "operations"];
  const grouped = new Map<string, ChecklistItemData[]>();
  for (const cat of order) {
    const matching = items.filter((i) => i.category === cat);
    if (matching.length > 0) grouped.set(cat, matching);
  }
  // Catch any categories not in the predefined order
  for (const item of items) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, items.filter((i) => i.category === item.category));
    }
  }
  return grouped;
}

// ── Subcomponents ───────────────────────────────────

function DeadlineCountdownCard({ item }: { item: ChecklistItemData }) {
  const days = daysUntil(item.deadline!);
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;

  return (
    <div
      className={`
        relative flex flex-col gap-1.5 rounded-lg border px-4 py-3
        ${isOverdue
          ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : isUrgent
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        }
      `}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {item.title}
        </span>
        <ComplianceStatusBadge status={item.status} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDeadlineDate(item.deadline!)}
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${
            isOverdue
              ? "text-red-600 dark:text-red-400"
              : isUrgent
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
        </span>
      </div>
      {item.statuteReference && (
        <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {item.statuteReference}
        </span>
      )}
    </div>
  );
}

function ComplianceScoreRing({ satisfied, total }: { satisfied: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((satisfied / total) * 100);
  const circumference = 2 * Math.PI * 36; // r=36
  const dashOffset = circumference - (pct / 100) * circumference;

  const color =
    pct >= 80
      ? "stroke-emerald-500"
      : pct >= 50
      ? "stroke-amber-500"
      : "stroke-red-500";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
      <svg className="absolute inset-0" viewBox="0 0 80 80" width={88} height={88}>
        <circle
          cx="40" cy="40" r="36"
          fill="none"
          strokeWidth="6"
          className="stroke-gray-100 dark:stroke-gray-700"
        />
        <circle
          cx="40" cy="40" r="36"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={`${color} transition-[stroke-dashoffset] duration-700 ease-out`}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{pct}%</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">compliant</span>
      </div>
    </div>
  );
}

function StatusBreakdownBar({
  counts,
}: {
  counts: { satisfied: number; unsatisfied: number; overdue: number; not_applicable: number };
}) {
  const total = counts.satisfied + counts.unsatisfied + counts.overdue + counts.not_applicable;
  if (total === 0) return null;

  const segments = [
    { key: "satisfied", count: counts.satisfied, color: "bg-emerald-500", label: "Satisfied" },
    { key: "unsatisfied", count: counts.unsatisfied, color: "bg-amber-400", label: "Pending" },
    { key: "overdue", count: counts.overdue, color: "bg-red-500", label: "Overdue" },
    { key: "not_applicable", count: counts.not_applicable, color: "bg-gray-300 dark:bg-gray-600", label: "N/A" },
  ].filter((s) => s.count > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} transition-all duration-500`}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
            <span>{seg.label}</span>
            <span className="font-medium text-gray-900 dark:text-gray-200 tabular-nums">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryGroup({
  category,
  items,
  defaultOpen = true,
}: {
  category: string;
  items: ChecklistItemData[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const satisfiedCount = items.filter((i) => i.status === "satisfied").length;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-3"
      >
        {open ? (
          <ChevronDown size={16} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {formatCategoryLabel(category)}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {satisfiedCount}/{items.length}
        </span>
        <span className="ml-auto flex h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          {items.length > 0 && (
            <span
              className="bg-emerald-500 transition-all duration-300"
              style={{ width: `${(satisfiedCount / items.length) * 100}%` }}
            />
          )}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 pt-1 pb-2">
          {items.map((item) => (
            <ComplianceChecklistItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────

export function ComplianceDashboard({ communityId }: ComplianceDashboardProps) {
  const [items, setItems] = useState<ChecklistItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ChecklistFilters>({ status: "all", category: "all" });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchChecklist(communityId)
      .then((rows) => mounted && setItems(rows))
      .catch((err) => mounted && setError(err.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [communityId]);

  const categories = useMemo(() => uniqueCategories(items), [items]);
  const filtered = useMemo(() => filterChecklistItems(items, filters), [items, filters]);

  const upcoming = useMemo(() => {
    const pending = items.filter(
      (i) => i.deadline && (i.status === "unsatisfied" || i.status === "overdue"),
    );
    return [...pending].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const db = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [items]);

  const statusCounts = useMemo(() => {
    const counts = { satisfied: 0, unsatisfied: 0, overdue: 0, not_applicable: 0 };
    for (const i of items) {
      if (i.status in counts) counts[i.status as keyof typeof counts]++;
    }
    return counts;
  }, [items]);

  const applicableTotal = items.length - statusCounts.not_applicable;
  const groupedItems = useMemo(() => groupByCategory(filtered), [filtered]);

  // Detect statute type from items for contextual display
  const primaryStatute = useMemo(() => {
    const refs = items.map((i) => i.statuteReference ?? "").filter(Boolean);
    if (refs.some((r) => r.includes("718"))) return "§718";
    if (refs.some((r) => r.includes("720"))) return "§720";
    return null;
  }, [items]);

  function handleExportPdf() {
    const bytes = generateChecklistPdf(toPdfItems(filtered));
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compliance-checklist.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
        <XCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Section 1: Urgent Deadlines (TOP — most actionable) ── */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Upcoming Deadlines
            </h2>
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 tabular-nums">
              {upcoming.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.slice(0, 6).map((item) => (
              <DeadlineCountdownCard key={`deadline-${item.id}`} item={item} />
            ))}
          </div>
          {upcoming.length > 6 && (
            <p className="mt-2 text-xs text-gray-400">
              +{upcoming.length - 6} more deadline{upcoming.length - 6 > 1 ? "s" : ""} below
            </p>
          )}
        </section>
      )}

      {/* ── Section 2: Compliance Summary + Filters ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Score ring */}
          <div className="flex items-center gap-5">
            <ComplianceScoreRing satisfied={statusCounts.satisfied} total={applicableTotal} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {statusCounts.satisfied} of {applicableTotal} items satisfied
              </span>
              {primaryStatute && (
                <span className="text-xs text-gray-400">
                  Florida Statute {primaryStatute}
                </span>
              )}
            </div>
          </div>

          {/* Breakdown bar */}
          <div className="flex-1 min-w-0">
            <StatusBreakdownBar counts={statusCounts} />
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Filter size={14} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Status
            </label>
            <select
              id="status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ChecklistFilters["status"] }))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="all">All Statuses</option>
              <option value="satisfied">Satisfied</option>
              <option value="unsatisfied">Unsatisfied</option>
              <option value="overdue">Overdue</option>
              <option value="not_applicable">Not Applicable</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Category
            </label>
            <select
              id="category"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {formatCategoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={handleExportPdf}>
              <FileDown size={14} className="mr-1.5" />
              Export PDF
            </Button>
          </div>
        </div>
      </section>

      {/* ── Section 3: Checklist Items (grouped by category) ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            Compliance Checklist
          </h2>
          <span className="text-xs text-gray-400 tabular-nums">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-700">
            <Shield size={32} className="text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No items match the current filters.
            </p>
          </div>
        ) : filters.category !== "all" ? (
          /* When a specific category is selected, show flat list */
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((item) => (
              <ComplianceChecklistItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          /* Default: grouped by category with collapsible sections */
          <div className="flex flex-col gap-4">
            {Array.from(groupedItems.entries()).map(([cat, catItems]) => (
              <CategoryGroup
                key={cat}
                category={cat}
                items={catItems}
                defaultOpen={catItems.some((i) => i.status === "overdue" || i.status === "unsatisfied")}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ComplianceDashboard;
