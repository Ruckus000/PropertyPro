'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { useComplianceChecklist } from '@/hooks/use-compliance-checklist';
import { useComplianceMutations } from '@/hooks/use-compliance-mutations';
import { buildComplianceSummary, sortByPriority } from '@/lib/utils/compliance-calculator';
import { ComplianceDetailPanel } from './compliance-detail-panel';
import { ComplianceOnboarding } from './compliance-onboarding';
import { ComplianceActivityFeed } from './compliance-activity-feed';
import { ComplianceQueue } from './compliance-queue';
import { matchesFilter } from './compliance-pill-mapping';
import type { FilterKey } from './compliance-pill-mapping';
import { UploadDocumentModal } from './upload-document-modal';
import { LinkDocumentModal } from './link-document-modal';
import { hasBoardDesignation, type BoardDesignation } from '@propertypro/shared';
import type { ChecklistItemData } from './compliance-checklist-item';

// 'manager' = operational (CAM) audience view; 'board' = board audience view.
// The label stays "CAM view" (Community Association Manager is the Florida term);
// only the internal value is v3-neutral so it carries no legacy-role vocabulary.
type ViewMode = 'manager' | 'board';

export interface ComplianceCommandCenterProps {
  communityId: number;
  isAdmin: boolean;
  designation: BoardDesignation | null;
  canWrite: boolean;
}

function defaultView(designation: BoardDesignation | null): ViewMode {
  return hasBoardDesignation(designation) ? 'board' : 'manager';
}

function showToggle(isAdmin: boolean, designation: BoardDesignation | null): boolean {
  return isAdmin || hasBoardDesignation(designation);
}

export function ComplianceCommandCenter({
  communityId,
  isAdmin,
  designation,
  canWrite,
}: ComplianceCommandCenterProps) {
  const storageKey = `compliance.audienceView.${communityId}`;

  const [view, setView] = useState<ViewMode>(() => {
    // Guard SSR: this client component is server-rendered for the initial HTML,
    // where `window` is undefined. Matches the codebase's typeof-window pattern
    // (e.g. ViewToggle, query-provider) — reads persisted state only in the browser.
    if (typeof window === 'undefined') return defaultView(designation);
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'manager' || stored === 'board') return stored;
    return defaultView(designation);
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, view);
  }, [storageKey, view]);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploadItem, setUploadItem] = useState<ChecklistItemData | null>(null);
  const [linkItem, setLinkItem] = useState<ChecklistItemData | null>(null);
  const { data: items = [], isLoading, error, refetch } = useComplianceChecklist(communityId);
  const mutations = useComplianceMutations(communityId);

  const summary = useMemo(() => buildComplianceSummary(items, new Date()), [items]);

  // Ref tracks which selectedId we already scrolled to, so we only trigger
  // the scrollIntoView behavior when the selection actually changes (not on
  // every re-render). Initialized to null so the very first selection does
  // NOT scroll (the row may not yet be in the DOM on initial mount).
  const selectedRowRef = useRef<number | null>(null);
  const selectedItem = useMemo(
    () => (selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null),
    [items, selectedId],
  );
  const isSelectedHidden = useMemo(
    () => selectedItem !== null && !matchesFilter(selectedItem, filter),
    [selectedItem, filter],
  );

  // Initial selection: pick the first item by priority. Fallback: if the
  // selected item disappears entirely (e.g., removed from data), pick the
  // new top item.
  useEffect(() => {
    if (items.length > 0 && selectedId === null) {
      const first = sortByPriority(items)[0];
      if (first) setSelectedId(first.id);
    }
    if (selectedId !== null && !items.some((i) => i.id === selectedId)) {
      setSelectedId(sortByPriority(items)[0]?.id ?? null);
    }
  }, [items, selectedId]);

  // Scroll the selected row into view after layout settles when selection changes.
  useEffect(() => {
    if (selectedId == null || selectedRowRef.current === selectedId) return;
    selectedRowRef.current = selectedId;
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-row-id="${selectedId}"]`);
      if (row && 'scrollIntoView' in row) (row as HTMLElement).scrollIntoView({ block: 'nearest' });
    });
  }, [selectedId]);

  if (error) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load compliance records"
        description="Something went wrong while loading your compliance data."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            Retry
          </button>
        }
      />
    );
  }

  const breadcrumb = (
    <ol className="flex items-center gap-2 text-sm text-content-secondary">
      <li><Link href="/dashboard">Communities</Link></li>
      <li aria-hidden="true">/</li>
      <li aria-current="page" className="text-content">Compliance</li>
    </ol>
  );

  const actions = (
    <div className="flex items-center gap-2">
      {showToggle(isAdmin, designation) && (
        <div role="group" aria-label="Audience view" className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border-default)] p-0.5">
          <button
            type="button"
            aria-pressed={view === 'manager'}
            onClick={() => setView('manager')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'manager' ? 'bg-[var(--interactive-subtle)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >CAM view</button>
          <button
            type="button"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'board' ? 'bg-[var(--interactive-subtle)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >Board view</button>
        </div>
      )}
      {canWrite && (
        <Button
          variant="outline"
          disabled={selectedItem === null}
          onClick={() => {
            if (selectedItem) setUploadItem(selectedItem);
          }}
        >
          Upload record
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={breadcrumb}
        title="Compliance"
        description="Records and statutory requirements"
        actions={actions}
      />

      {summary.attentionCount > 0 && (
        <section
          aria-labelledby="compliance-banner-title"
          className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border-l-4 border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--status-warning)] text-white text-xs font-bold">!</span>
            <div>
              <div id="compliance-banner-title" className="font-semibold text-[var(--status-warning)]">Requirements are now in effect</div>
              <div className="text-sm text-content-secondary">Tracking is active for required records, posting windows, and board approvals.</div>
            </div>
          </div>
          <span className="rounded-full bg-[var(--status-warning)] px-3 py-1 text-xs font-semibold text-white">
            {view === 'board'
              ? `${summary.needsBoardActionCount} need board action`
              : `${summary.attentionCount} need attention`}
          </span>
        </section>
      )}

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading compliance dashboard"
          className="flex flex-col gap-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-[var(--radius-md)]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Skeleton className="h-96 rounded-[var(--radius-md)]" />
            <Skeleton className="h-96 rounded-[var(--radius-md)]" />
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          preset="compliance_empty"
          action={
            canWrite ? (
              <Link
                href={`/communities/${communityId}/documents`}
                className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
              >
                Upload First Document
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <section aria-label="Compliance summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Readiness" value={`${summary.readiness.percentage}%`} meta={`${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} items satisfied`} />
            <KpiCard label="Posting windows" value={summary.postingWindowsDueSoonCount} meta="Due inside 7 days" />
            <KpiCard label="Overdue" value={summary.overdueCount} meta="Past deadline" tone={summary.overdueCount > 0 ? 'alert' : 'default'} />
            <KpiCard label="Needs board action" value={summary.needsBoardActionCount} meta="Approvals and reviews pending" />
          </section>

          <ComplianceOnboarding items={items as ChecklistItemData[]} onUpload={(item) => setUploadItem(item as ChecklistItemData)} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <ComplianceQueue
              items={items as ChecklistItemData[]}
              canWrite={canWrite}
              designation={designation}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpload={(item) => setUploadItem(item)}
              onLink={(item) => setLinkItem(item)}
              onView={(item) => {
                if (item.documentId) {
                  window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
                }
              }}
              onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
              filter={filter}
              onFilterChange={setFilter}
            />
            <ComplianceDetailPanel
              item={selectedItem}
              communityId={communityId}
              canWrite={canWrite}
              designation={designation}
              onUpload={(item) => setUploadItem(item)}
              onLink={(item) => setLinkItem(item)}
              onView={(item) => {
                if (item.documentId) {
                  window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
                }
              }}
              onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
              isSelectedHidden={isSelectedHidden}
              onClearFilter={() => setFilter('all')}
            />
          </div>
        </>
      )}

      {uploadItem && (
        <UploadDocumentModal
          communityId={communityId}
          defaultTitle={uploadItem.title}
          categoryName={uploadItem.category}
          onUploaded={(documentId) => {
            mutations.linkDocument.mutate({ itemId: uploadItem.id, documentId });
            setUploadItem(null);
          }}
          onClose={() => setUploadItem(null)}
        />
      )}
      {linkItem && (
        <LinkDocumentModal
          communityId={communityId}
          onSelect={(documentId) => {
            mutations.linkDocument.mutate({ itemId: linkItem.id, documentId });
            setLinkItem(null);
          }}
          onClose={() => setLinkItem(null)}
        />
      )}

      <section id="compliance-activity-feed">
        <ComplianceActivityFeed communityId={communityId} />
      </section>
    </div>
  );
}

function KpiCard({
  label, value, meta, tone = 'default',
}: { label: string; value: string | number; meta: string; tone?: 'default' | 'alert' }) {
  return (
    <article className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{label}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${tone === 'alert' ? 'text-[var(--status-danger)]' : 'text-content'}`}>{value}</div>
      <div className="mt-1 text-sm text-content-secondary">{meta}</div>
    </article>
  );
}

export default ComplianceCommandCenter;
