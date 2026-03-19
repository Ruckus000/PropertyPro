"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@propertypro/ui";
import { ComplianceChecklistItem, type ChecklistItemData } from "./compliance-checklist-item";
import { ComplianceFilterPills, type StatusFilter } from "./compliance-filter-pills";
import { ComplianceItemActions } from "./compliance-item-actions";
import { LinkDocumentModal } from "./link-document-modal";
import { UploadDocumentModal } from "./upload-document-modal";
import { DeadlineRibbon } from "./deadline-ribbon";
import { ComplianceOnboarding } from "./compliance-onboarding";
import { ComplianceActivityFeed } from "./compliance-activity-feed";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";
import { useComplianceChecklist } from "@/hooks/useComplianceChecklist";
import { useComplianceMutations } from "@/hooks/useComplianceMutations";
import { generateChecklistPdf } from "@/lib/utils/pdf-export";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  Shield,
  XCircle,
  CheckCircle2,
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

function toPdfItems(items: ChecklistItemData[]) {
  return items.map((i) => ({
    title: i.title,
    category: i.category,
    status: i.status,
    deadline: i.deadline ?? null,
  }));
}

/** Group items by category, preserving a defined order. */
function groupByCategory(items: ChecklistItemData[]): Map<string, ChecklistItemData[]> {
  const order = ["governing_documents", "financial_records", "meeting_records", "insurance", "operations"];
  const grouped = new Map<string, ChecklistItemData[]>();
  for (const cat of order) {
    const matching = items.filter((i) => i.category === cat);
    if (matching.length > 0) grouped.set(cat, matching);
  }
  for (const item of items) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, items.filter((i) => i.category === item.category));
    }
  }
  return grouped;
}

// ── Category Header ─────────────────────────────────

function CategoryGroup({
  category,
  items,
  defaultOpen = false,
  renderActions,
}: {
  category: string;
  items: ChecklistItemData[];
  defaultOpen?: boolean;
  renderActions?: (item: ChecklistItemData) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const satisfiedCount = items.filter((i) => i.status === "satisfied" || i.status === "not_applicable").length;
  const allSatisfied = satisfiedCount === items.length;

  return (
    <div className="flex flex-col">
      {/* Category row */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-3 w-full px-4 py-3
          text-left transition-colors duration-quick cursor-pointer
          hover:bg-surface-hover
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-strong)]
          min-h-[44px]
          ${allSatisfied ? "bg-status-success-bg/30" : ""}
        `}
      >
        {/* Category label */}
        <span className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
          {formatCategoryLabel(category)}
        </span>

        {/* Count */}
        <span className="text-xs text-content-tertiary tabular-nums">
          {satisfiedCount} of {items.length}
        </span>

        {/* Progress dots (max 10) */}
        {items.length <= 10 && (
          <span className="flex items-center gap-1 ml-1">
            {items.map((item) => (
              <span
                key={item.id}
                className={`h-1.5 w-1.5 rounded-full ${
                  item.status === "satisfied" || item.status === "not_applicable"
                    ? "bg-[var(--status-success)]"
                    : "bg-[var(--border-default)]"
                }`}
              />
            ))}
          </span>
        )}

        {/* Chevron or check */}
        <span className="ml-auto shrink-0">
          {allSatisfied ? (
            <CheckCircle2 size={14} className="text-status-success" />
          ) : open ? (
            <ChevronDown size={14} className="text-content-tertiary" />
          ) : (
            <ChevronRight size={14} className="text-content-tertiary" />
          )}
        </span>
      </button>

      {/* Items */}
      <div
        className={`
          overflow-hidden transition-all duration-quick ease-out
          ${open ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="border-t border-edge-subtle">
          {items.map((item) => (
            <ComplianceChecklistItem
              key={item.id}
              item={item}
              actions={renderActions?.(item)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      {/* Hero placeholder */}
      <div className="flex items-center justify-between py-4 border-b border-edge-subtle">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-surface-muted" />
          <div className="flex flex-col gap-1.5">
            <div className="h-5 w-48 rounded bg-surface-muted" />
            <div className="h-3.5 w-32 rounded bg-surface-muted" />
          </div>
        </div>
        <div className="h-4 w-20 rounded bg-surface-muted" />
      </div>

      {/* Filter pills placeholder */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-surface-muted"
            style={{ width: `${60 + i * 8}px`, animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>

      {/* Category row placeholders */}
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3"
          style={{ animationDelay: `${150 + i * 50}ms` }}
        >
          <div className="h-3 w-32 rounded bg-surface-muted" />
          <div className="h-3 w-10 rounded bg-surface-muted" />
          <div className="flex gap-1 ml-auto">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-1.5 w-1.5 rounded-full bg-surface-muted" />
            ))}
          </div>
          <div className="h-3.5 w-3.5 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Hero Metric ─────────────────────────────────────

function HeroMetric({
  statusCounts,
  applicableTotal,
  primaryStatute,
}: {
  statusCounts: { satisfied: number; unsatisfied: number; overdue: number; not_applicable: number };
  applicableTotal: number;
  primaryStatute: string | null;
}) {
  const pct = applicableTotal === 0 ? 0 : Math.round((statusCounts.satisfied / applicableTotal) * 100);
  const allSatisfied = statusCounts.overdue === 0 && statusCounts.unsatisfied === 0 && applicableTotal > 0;
  const hasOverdue = statusCounts.overdue > 0;

  return (
    <div
      className={`
        flex items-center justify-between py-4 border-b border-edge-subtle
        sticky top-0 z-10 bg-surface-page sm:static sm:z-auto
        ${allSatisfied ? "sm:bg-status-success-bg/30 -mx-4 px-4 rounded-[var(--radius-md)]" : ""}
      `}
    >
      <div className="flex items-center gap-3">
        {allSatisfied ? (
          <CheckCircle2 size={24} className="text-status-success shrink-0" />
        ) : hasOverdue ? (
          <span className="flex h-6 w-6 items-center justify-center text-status-danger shrink-0 text-lg leading-none">&#9650;</span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center text-status-warning shrink-0 text-lg leading-none">&#9684;</span>
        )}
        <div className="flex flex-col">
          <span className={`text-lg font-semibold ${hasOverdue ? "text-status-danger" : "text-content"}`}>
            {allSatisfied
              ? "All requirements satisfied"
              : hasOverdue
              ? `${statusCounts.overdue} item${statusCounts.overdue !== 1 ? "s" : ""} overdue`
              : `${statusCounts.unsatisfied} item${statusCounts.unsatisfied !== 1 ? "s" : ""} need attention`
            }
          </span>
          <span className="text-sm text-content-tertiary">
            {statusCounts.satisfied} of {applicableTotal} items
            {primaryStatute ? ` \u00b7 Florida Statute ${primaryStatute}` : ""}
          </span>
        </div>
      </div>

      {/* Mini progress */}
      {!allSatisfied && (
        <div className="hidden sm:flex flex-col items-end gap-1">
          <span className="text-sm font-semibold text-content tabular-nums">{pct}%</span>
          <div className="flex h-1 w-24 overflow-hidden rounded-full bg-surface-muted">
            {statusCounts.satisfied > 0 && (
              <div
                className="bg-[var(--status-success)] transition-all duration-500"
                style={{ width: `${(statusCounts.satisfied / applicableTotal) * 100}%` }}
              />
            )}
            {statusCounts.unsatisfied > 0 && (
              <div
                className="bg-[var(--status-warning)] transition-all duration-500"
                style={{ width: `${(statusCounts.unsatisfied / applicableTotal) * 100}%` }}
              />
            )}
            {statusCounts.overdue > 0 && (
              <div
                className="bg-[var(--status-danger)] transition-all duration-500"
                style={{ width: `${(statusCounts.overdue / applicableTotal) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────

export function ComplianceDashboard({ communityId }: ComplianceDashboardProps) {
  const { data: items = [], isLoading, error } = useComplianceChecklist(communityId);
  const mutations = useComplianceMutations(communityId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");

  // Modal state
  const [linkModalItem, setLinkModalItem] = useState<ChecklistItemData | null>(null);
  const [uploadModalItem, setUploadModalItem] = useState<ChecklistItemData | null>(null);

  const filters: ChecklistFilters = { status: statusFilter, category: categoryFilter };
  const filtered = useMemo(() => filterChecklistItems(items, filters), [items, filters]);

  const statusCounts = useMemo(() => {
    const counts = { satisfied: 0, unsatisfied: 0, overdue: 0, not_applicable: 0 };
    for (const i of items) {
      if (i.status in counts) counts[i.status as keyof typeof counts]++;
    }
    return counts;
  }, [items]);

  const applicableTotal = items.length - statusCounts.not_applicable;
  const groupedItems = useMemo(() => groupByCategory(filtered), [filtered]);

  const primaryStatute = useMemo(() => {
    const refs = items.map((i) => i.statuteReference ?? "").filter(Boolean);
    if (refs.some((r) => r.includes("718"))) return "\u00a7718";
    if (refs.some((r) => r.includes("720"))) return "\u00a7720";
    return null;
  }, [items]);

  const categories = useMemo(() => {
    const order = ["governing_documents", "financial_records", "meeting_records", "insurance", "operations"];
    const present = new Set(items.map((i) => i.category));
    return order.filter((c) => present.has(c));
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

  function renderActions(item: ChecklistItemData) {
    return (
      <ComplianceItemActions
        item={item}
        onUpload={() => setUploadModalItem(item)}
        onLink={() => setLinkModalItem(item)}
        onMarkNA={() => mutations.markNotApplicable.mutate({ itemId: item.id })}
        onMarkApplicable={() => mutations.markApplicable.mutate({ itemId: item.id })}
        onUnlink={() => mutations.unlinkDocument.mutate({ itemId: item.id })}
      />
    );
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
        <XCircle size={16} />
        {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Hero Metric ── */}
      <HeroMetric
        statusCounts={statusCounts}
        applicableTotal={applicableTotal}
        primaryStatute={primaryStatute}
      />

      {/* ── Onboarding ── */}
      <ComplianceOnboarding
        items={items}
        onUpload={(item) => setUploadModalItem(item)}
      />

      {/* ── Deadline Ribbon ── */}
      <DeadlineRibbon items={items} />

      {/* ── Filter Pills + Export ── */}
      <div className="flex items-center justify-between gap-4">
        <ComplianceFilterPills
          active={statusFilter}
          counts={statusCounts}
          total={items.length}
          onChange={(f) => {
            setStatusFilter(f);
            setCategoryFilter("all");
          }}
        />
        <Button variant="secondary" size="sm" onClick={handleExportPdf} className="shrink-0">
          <FileDown size={14} className="mr-1.5" />
          Export
        </Button>
      </div>

      {/* ── Category sub-filter ── */}
      {statusFilter !== "all" && categories.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mt-4">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`
              text-xs px-2.5 py-1 min-h-[44px] sm:min-h-0 rounded-[var(--radius-full)] transition-colors duration-quick
              ${categoryFilter === "all"
                ? "bg-surface-muted text-content font-medium"
                : "text-content-tertiary hover:bg-surface-hover"}
            `}
          >
            All categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`
                text-xs px-2.5 py-1 min-h-[44px] sm:min-h-0 rounded-[var(--radius-full)] whitespace-nowrap transition-colors duration-quick
                ${categoryFilter === cat
                  ? "bg-surface-muted text-content font-medium"
                  : "text-content-tertiary hover:bg-surface-hover"}
              `}
            >
              {formatCategoryLabel(cat)}
            </button>
          ))}
        </div>
      )}

      {/* ── Mobile Category Quick-Jump ── */}
      {statusFilter === "all" && categories.length > 1 && (
        <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto scrollbar-hide -mt-4 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                const el = document.getElementById(`cat-${cat}`);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="
                text-xs px-3 py-2 min-h-[44px] flex items-center
                rounded-[var(--radius-full)] whitespace-nowrap transition-colors duration-quick
                text-content-tertiary border border-edge-subtle
                hover:bg-surface-hover active:bg-surface-muted
              "
            >
              {formatCategoryLabel(cat)}
            </button>
          ))}
        </div>
      )}

      {/* ── Checklist ── */}
      <section>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-edge py-12 text-center">
            <Shield size={32} className="text-content-tertiary mb-2" />
            <p className="text-sm text-content-secondary">
              No items match the current filters.
            </p>
          </div>
        ) : categoryFilter !== "all" || statusFilter !== "all" ? (
          <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card overflow-hidden">
            {filtered.map((item) => (
              <ComplianceChecklistItem key={item.id} item={item} actions={renderActions(item)} />
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card overflow-hidden divide-y divide-[var(--border-subtle)]">
            {Array.from(groupedItems.entries()).map(([cat, catItems]) => (
              <div key={cat} id={`cat-${cat}`} className="scroll-mt-20">
                <CategoryGroup
                  category={cat}
                  items={catItems}
                  defaultOpen={catItems.some((i) => i.status === "overdue")}
                  renderActions={renderActions}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Activity Feed ── */}
      <ComplianceActivityFeed communityId={communityId} />

      {/* ── Modals ── */}
      {linkModalItem && (
        <LinkDocumentModal
          communityId={communityId}
          onSelect={(documentId) => {
            mutations.linkDocument.mutate({ itemId: linkModalItem.id, documentId });
            setLinkModalItem(null);
          }}
          onClose={() => setLinkModalItem(null)}
        />
      )}
      {uploadModalItem && (
        <UploadDocumentModal
          communityId={communityId}
          defaultTitle={uploadModalItem.title}
          onUploaded={(documentId) => {
            mutations.linkDocument.mutate({ itemId: uploadModalItem.id, documentId });
          }}
          onClose={() => setUploadModalItem(null)}
        />
      )}
    </div>
  );
}

export default ComplianceDashboard;
