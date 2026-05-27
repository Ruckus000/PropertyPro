'use client';

import React, { useMemo, useState } from 'react';
import { Badge } from '@propertypro/ui';
import { sortByPriority, needsAttention, SEVEN_DAYS_MS } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import type { ChecklistItemData } from './compliance-checklist-item';
import { getTemplateDefaultVisibility } from './compliance-visibility';
import { VISIBILITY_LABEL, VISIBILITY_VARIANT, statusLabel, statusVariant } from './compliance-pill-mapping';

export type FilterKey = 'all' | 'action_needed' | 'overdue' | 'due_soon' | 'satisfied';
type SortKey = 'status' | 'deadline' | 'statute';
type SortDir = 'asc' | 'desc';

export interface ComplianceQueueProps {
  items: ChecklistItemData[];
  canWrite: boolean;
  role?: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
}

function deadlineCell(item: ChecklistItemData): string {
  if (item.status === 'satisfied') return 'Posted';
  if (item.rollingWindow && !item.deadline) return `Rolling ${item.rollingWindow.months} mo`;
  if (!item.deadline) return '—';
  return new Date(item.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}


export function matchesFilter(item: ChecklistItemData, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'action_needed') return needsAttention(item);
  if (filter === 'overdue') return item.status === 'overdue';
  if (filter === 'satisfied') return item.status === 'satisfied';
  if (filter === 'due_soon') {
    return !!item.deadline && item.status === 'unsatisfied' &&
      (new Date(item.deadline).getTime() - Date.now()) <= SEVEN_DAYS_MS;
  }
  return true;
}

function SortableHeader({
  label, columnKey, sortKey, sortDir, onClick, align = 'left',
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === columnKey;
  const ariaSort: 'ascending' | 'descending' | 'none' =
    active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={`px-6 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-content-tertiary hover:text-content"
      >
        {label}
        <span aria-hidden="true" className="text-[0.6rem]">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm min-h-[36px] ${
        active
          ? 'border-[var(--interactive-primary)] bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)] font-semibold'
          : 'border-[var(--border-default)] text-content hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

export function ComplianceQueue({
  items, canWrite, role, selectedId, onSelect,
  onUpload, onLink, onView, onMarkApplicable,
  filter, onFilterChange,
}: ComplianceQueueProps) {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'status' ? 'desc' : 'asc');
    }
  }

  const sorted = useMemo(() => sortByPriority(items), [items]);

  const ordered = useMemo(() => {
    if (sortKey === 'status') return sortDir === 'desc' ? sorted : sorted.slice().reverse();
    if (sortKey === 'deadline') {
      return sorted.slice().sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
        const db = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
        return sortDir === 'asc' ? da - db : db - da;
      });
    }
    return sorted.slice().sort((a, b) =>
      sortDir === 'asc'
        ? (a.statuteReference ?? '').localeCompare(b.statuteReference ?? '')
        : (b.statuteReference ?? '').localeCompare(a.statuteReference ?? ''),
    );
  }, [sorted, sortKey, sortDir]);

  const filtered = useMemo(() => ordered.filter((i) => matchesFilter(i, filter)), [ordered, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    action_needed: items.filter((i) => needsAttention(i)).length,
    overdue: items.filter((i) => i.status === 'overdue').length,
    due_soon: items.filter(
      (i) => i.status === 'unsatisfied' && !!i.deadline &&
        (new Date(i.deadline).getTime() - Date.now()) <= SEVEN_DAYS_MS,
    ).length,
    satisfied: items.filter((i) => i.status === 'satisfied').length,
  }), [items]);

  function dispatch(cta: NonNullable<ReturnType<typeof resolveComplianceCta>>, item: ChecklistItemData) {
    onSelect(item.id);
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  return (
    <section aria-labelledby="queue-heading" className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card">
      <header className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <h2 id="queue-heading" className="text-lg font-semibold">Required records queue</h2>
          <p className="text-sm text-content-secondary">
            Showing {filtered.length} of {items.length} records
            {filter !== 'all' && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => onFilterChange('all')}
                  className="text-[var(--interactive-primary)] hover:underline"
                >
                  × Clear filters
                </button>
              </>
            )}
          </p>
        </div>
      </header>

      <div role="group" aria-label="Filter records" className="flex flex-wrap gap-2 px-6 pb-3">
        <FilterChip active={filter === 'action_needed'} onClick={() => onFilterChange('action_needed')}>
          {`Action needed ${counts.action_needed}`}
        </FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => onFilterChange('all')}>
          {`All ${counts.all}`}
        </FilterChip>
        <FilterChip active={filter === 'overdue'} onClick={() => onFilterChange('overdue')}>
          {`Overdue ${counts.overdue}`}
        </FilterChip>
        <FilterChip active={filter === 'due_soon'} onClick={() => onFilterChange('due_soon')}>
          {`Due ≤ 7 days ${counts.due_soon}`}
        </FilterChip>
        <FilterChip active={filter === 'satisfied'} onClick={() => onFilterChange('satisfied')}>
          {`Satisfied ${counts.satisfied}`}
        </FilterChip>
        {filter !== 'all' && (
          <FilterChip active={false} onClick={() => onFilterChange('all')}>
            × Clear filters
          </FilterChip>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-content-secondary">
          No records match these filters.
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className="ml-2 text-[var(--interactive-primary)] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-y border-edge-subtle bg-surface-muted text-left text-xs font-semibold uppercase tracking-wider text-content-tertiary">
              <th scope="col" className="px-6 py-3">Record</th>
              <SortableHeader label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('status')} />
              <th scope="col" className="px-6 py-3">Visibility</th>
              <SortableHeader label="Deadline" columnKey="deadline" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('deadline')} align="right" />
              <SortableHeader label="Statute" columnKey="statute" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('statute')} />
              <th scope="col" className="px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const cta = resolveComplianceCta(item, canWrite, role);
              const vis = getTemplateDefaultVisibility(item.templateKey);
              return (
                <tr
                  key={item.id}
                  data-row-id={item.id}
                  aria-current={selectedId === item.id ? 'true' : undefined}
                  className={
                    selectedId === item.id
                      ? 'bg-[var(--interactive-primary-soft)]'
                      : 'hover:bg-surface-muted'
                  }
                >
                  <td className="px-6 py-4">
                    <div className="font-medium">{item.title}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={VISIBILITY_VARIANT[vis]}>{VISIBILITY_LABEL[vis]}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">{deadlineCell(item)}</td>
                  <td className="px-6 py-4 text-sm text-content-secondary">
                    {item.statuteReference ?? ''}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {cta ? (
                      <button
                        type="button"
                        onClick={() => dispatch(cta, item)}
                        className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-sm hover:bg-surface-muted"
                      >
                        {cta.label}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
