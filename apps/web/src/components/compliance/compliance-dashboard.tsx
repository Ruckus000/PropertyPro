"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@propertypro/ui";
import { ComplianceChecklistItem, type ChecklistItemData } from "./compliance-checklist-item";
import { ComplianceStatusBadge } from "./compliance-badge";
import type { ComplianceStatus } from "@/lib/utils/compliance-calculator";
import { generateChecklistPdf } from "@/lib/utils/pdf-export";

export interface ComplianceDashboardProps {
  communityId: number;
}

export interface ChecklistFilters {
  status: "all" | ComplianceStatus;
  category: "all" | string;
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
    const pending = items.filter((i) => i.deadline && (i.status === "unsatisfied" || i.status === "overdue"));
    return [...pending].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const db = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Header>
          <div className="flex flex-col">
            <Card.Title>Compliance Checklist</Card.Title>
            <Card.Subtitle>Track required postings and deadlines</Card.Subtitle>
          </div>
          <Card.Actions>
            <Button onClick={handleExportPdf}>Export PDF</Button>
          </Card.Actions>
        </Card.Header>
        <Card.Section bordered>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col">
              <label htmlFor="status" className="text-sm text-[var(--text-secondary)]">Status</label>
              <select
                id="status"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ChecklistFilters["status"] }))}
                className="border rounded px-2 py-1 bg-[var(--surface-page)] dark:bg-gray-900"
              >
                <option value="all">All</option>
                <option value="satisfied">Satisfied</option>
                <option value="unsatisfied">Unsatisfied</option>
                <option value="overdue">Overdue</option>
                <option value="not_applicable">Not Applicable</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label htmlFor="category" className="text-sm text-[var(--text-secondary)]">Category</label>
              <select
                id="category"
                value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                className="border rounded px-2 py-1 bg-[var(--surface-page)] dark:bg-gray-900"
              >
                <option value="all">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-auto" aria-hidden>
              <ComplianceStatusBadge status="satisfied" />
              <ComplianceStatusBadge status="unsatisfied" className="ml-2" />
              <ComplianceStatusBadge status="overdue" className="ml-2" />
              <ComplianceStatusBadge status="not_applicable" className="ml-2" />
            </div>
          </div>
        </Card.Section>
      </Card>

      {loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div className="text-[var(--status-danger)]">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((item) => (
            <ComplianceChecklistItem key={item.id} item={item} />
          ))}
          {filtered.length === 0 && (
            <div className="text-sm text-[var(--text-secondary)]">No items match current filters.</div>
          )}
        </div>
      )}

      <div>
        <Card>
          <Card.Header>
            <Card.Title>Upcoming Deadlines</Card.Title>
          </Card.Header>
          <Card.Body>
            {upcoming.length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No upcoming deadlines.</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((i) => (
                  <li key={`deadline-${i.id}`} className="flex items-center justify-between">
                    <span className="truncate mr-3">{i.title}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[var(--text-secondary)]">{i.deadline?.slice(0, 10)}</span>
                      <ComplianceStatusBadge status={i.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}

export default ComplianceDashboard;

