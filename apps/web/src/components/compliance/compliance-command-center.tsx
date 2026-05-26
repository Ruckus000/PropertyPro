'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@propertypro/ui';
import { useComplianceChecklist } from '@/hooks/useComplianceChecklist';
import { useComplianceMutations } from '@/hooks/useComplianceMutations';
import { buildComplianceSummary, sortByPriority } from '@/lib/utils/compliance-calculator';
import { ComplianceDetailPanel } from './compliance-detail-panel';
import { ComplianceOnboarding } from './compliance-onboarding';
import { ComplianceActivityFeed } from './compliance-activity-feed';
import { ComplianceQueue } from './compliance-queue';
import { UploadDocumentModal } from './upload-document-modal';
import { LinkDocumentModal } from './link-document-modal';
import type { CommunityRole, NewCommunityRole } from '@propertypro/shared';
import type { ChecklistItemData } from './compliance-checklist-item';

type ViewMode = 'cam' | 'board';

export interface ComplianceCommandCenterProps {
  communityId: number;
  role: CommunityRole | NewCommunityRole;
  canWrite: boolean;
}

// CAM-class roles. Includes both `pm_admin` (NewCommunityRole) and
// `property_manager_admin` (legacy CommunityRole) to cover both sides
// of the in-progress role migration. Either string can arrive on the
// `role` prop depending on which auth path resolved the membership.
const CAM_LIKE_ROLES = new Set<string>(['cam', 'pm_admin', 'property_manager_admin', 'site_manager']);
const BOARD_LIKE_ROLES = new Set<string>(['board_president', 'board_member']);

function defaultViewForRole(role: string): ViewMode {
  if (BOARD_LIKE_ROLES.has(role)) return 'board';
  return 'cam';
}

function showToggle(role: string): boolean {
  return CAM_LIKE_ROLES.has(role) || BOARD_LIKE_ROLES.has(role);
}

export function ComplianceCommandCenter({
  communityId,
  role,
  canWrite,
}: ComplianceCommandCenterProps) {
  const [view, setView] = useState<ViewMode>(() => defaultViewForRole(role));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploadItem, setUploadItem] = useState<ChecklistItemData | null>(null);
  const [linkItem, setLinkItem] = useState<ChecklistItemData | null>(null);
  const { data: items = [], isLoading, error } = useComplianceChecklist(communityId);
  const mutations = useComplianceMutations(communityId);

  const summary = useMemo(() => buildComplianceSummary(items, new Date()), [items]);

  // Ref tracks which selectedId we already scrolled to, so we only trigger
  // the scrollIntoView behavior when the selection actually changes (not on
  // every re-render). Initialized to null so the very first selection does
  // NOT scroll (the row may not yet be in the DOM on initial mount).
  const selectedRowRef = useRef<number | null>(null);
  const selectedItem = selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null;

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
  }, [selectedId, items]);

  if (error) {
    return (
      <div className="rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
        We couldn&apos;t load compliance records. Please try again.
      </div>
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
      {showToggle(role) && (
        <div role="group" aria-label="Audience view" className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border-default)] p-0.5">
          <button
            type="button"
            aria-pressed={view === 'cam'}
            onClick={() => setView('cam')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'cam' ? 'bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >CAM view</button>
          <button
            type="button"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'board' ? 'bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >Board view</button>
        </div>
      )}
      {canWrite && <Button variant="secondary">Upload record</Button>}
      <Button variant="primary">Export readiness PDF</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={breadcrumb}
        title="Compliance"
        description="Records and statutory requirements"
        actions={actions}
        hideHelpButton
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

      {/* TODO(Slice B/C): replace with Skeleton during isLoading — currently flashes 100% / 0 counts on empty items */}
      <section aria-label="Compliance summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Readiness" value={`${summary.readiness.percentage}%`} meta={`${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} items satisfied`} />
        <KpiCard label="Posting windows" value={summary.postingWindowsDueSoonCount} meta="Due inside 7 days" />
        <KpiCard label="Overdue" value={summary.overdueCount} meta="Past deadline" tone={summary.overdueCount > 0 ? 'alert' : 'default'} />
        <KpiCard label="Needs board action" value={summary.needsBoardActionCount} meta="Approvals and reviews pending" />
      </section>

      <ComplianceOnboarding items={items as ChecklistItemData[]} onUpload={(item) => setUploadItem(item as ChecklistItemData)} />

      {/* Queue + loading state */}
      {isLoading && (
        <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center text-content-secondary">
          Loading&hellip;
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ComplianceQueue
            items={items as ChecklistItemData[]}
            canWrite={canWrite}
            role={role}
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
          />
          <ComplianceDetailPanel
            item={selectedItem}
            communityId={communityId}
            canWrite={canWrite}
            role={role}
            onUpload={(item) => setUploadItem(item)}
            onLink={(item) => setLinkItem(item)}
            onView={(item) => {
              if (item.documentId) {
                window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
              }
            }}
            onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
          />
        </div>
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
