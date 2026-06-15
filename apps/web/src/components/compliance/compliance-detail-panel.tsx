'use client';

import React from 'react';
import { Badge } from '@propertypro/ui';
import type { BoardDesignation } from '@propertypro/shared';
import { useComplianceActivityFeed, type AuditEntry } from '@/hooks/use-compliance-activity';
import type { ChecklistItemData } from './compliance-checklist-item';
import { getTemplateDefaultVisibility } from './compliance-visibility';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import { VISIBILITY_LABEL, VISIBILITY_VARIANT, statusLabel, statusVariant } from './compliance-pill-mapping';

export interface ComplianceDetailPanelProps {
  item: ChecklistItemData | null;
  communityId: number;
  canWrite: boolean;
  designation?: BoardDesignation | null;
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  isSelectedHidden?: boolean;
  onClearFilter?: () => void;
}

export function ComplianceDetailPanel({
  item,
  communityId,
  canWrite,
  designation,
  onUpload,
  onLink,
  onView,
  onMarkApplicable,
  isSelectedHidden,
  onClearFilter,
}: ComplianceDetailPanelProps) {
  const activity = useComplianceActivityFeed(communityId);

  if (!item) {
    return (
      <aside
        aria-label="Selected record details"
        className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-6 text-center text-sm text-content-secondary"
      >
        Select a record to see details.
      </aside>
    );
  }

  // item is narrowed to ChecklistItemData here (null case returns above).
  const selectedItem = item;

  // Use the shared CTA resolver so queue rows and the detail panel can never drift.
  const cta = resolveComplianceCta(selectedItem, canWrite, designation);
  const vis = getTemplateDefaultVisibility(selectedItem.templateKey);
  const activityHidden = (activity.error as { status?: number } | null)?.status === 403;
  const recentEvents: AuditEntry[] = activity.data?.data?.slice(0, 3) ?? [];

  function dispatchCta() {
    if (!cta) return;
    if (cta.handler === 'upload') onUpload(selectedItem);
    else if (cta.handler === 'link') onLink(selectedItem);
    else if (cta.handler === 'view') onView(selectedItem);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(selectedItem);
  }

  function scrollToActivityFeed() {
    const el = document.getElementById('compliance-activity-feed');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <aside
      aria-label="Selected record details"
      className="sticky top-6 rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-6"
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
        Selected record
      </div>
      <h3 className="mt-1 text-lg font-semibold leading-tight">{selectedItem.title}</h3>

      {isSelectedHidden && (
        <div role="alert" className="mt-3 rounded-[var(--radius-sm)] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] p-3 text-sm text-[var(--status-info)]">
          Selected record is hidden by the current filter.
          {onClearFilter && (
            <button type="button" onClick={onClearFilter} className="ml-2 underline hover:no-underline">
              Clear filter
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={statusVariant(selectedItem.status)}>{statusLabel(selectedItem)}</Badge>
        <Badge variant={VISIBILITY_VARIANT[vis]}>{VISIBILITY_LABEL[vis]}</Badge>
        {selectedItem.statuteReference && (
          <Badge variant="neutral">{selectedItem.statuteReference}</Badge>
        )}
      </div>

      <ul className="my-4 flex flex-col gap-3 border-y border-edge-subtle py-4" aria-label="Status checks">
        <Check
          ok={!!selectedItem.documentId}
          title="Document on file"
          desc={selectedItem.documentId ? 'Linked document is on record.' : 'No document linked yet.'}
        />
        <Check
          ok={!!selectedItem.documentPostedAt}
          title="Owner portal access"
          desc={selectedItem.documentPostedAt ? 'Posted and visible to authorized owners.' : 'Not yet posted.'}
        />
        <Check ok title="Audit trail" desc="Every action is recorded." />
      </ul>

      {cta && (
        <button
          type="button"
          onClick={dispatchCta}
          className="w-full rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--interactive-primary-hover)]"
        >
          {cta.label}
        </button>
      )}

      {!activityHidden && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">
            Recent activity
          </h4>
          {recentEvents.length === 0 ? (
            <p className="mt-2 text-sm text-content-secondary">No recent activity.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {recentEvents.map((e) => (
                <li key={e.id} className="text-content-secondary">
                  <span className="font-medium text-content">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>{' '}
                  — {e.action.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={scrollToActivityFeed}
            className="mt-3 text-sm text-[var(--interactive-primary)] hover:underline"
          >
            View full activity →
          </button>
        </div>
      )}
    </aside>
  );
}

function Check({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok
            ? 'bg-status-success-bg text-status-success'
            : 'bg-status-warning-bg text-status-warning'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-content-secondary">{desc}</div>
      </div>
    </li>
  );
}
