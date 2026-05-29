'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@propertypro/ui';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import { statusLabel, statusVariant, VISIBILITY_LABEL } from './compliance-pill-mapping';
import { getTemplateDefaultVisibility } from './compliance-visibility';
import { ComplianceItemActions } from './compliance-item-actions';
import { HELP_TEXT, type ChecklistItemData } from './compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';
import { cn } from '@/lib/utils';

export interface ComplianceRequirementCardProps {
  item: ChecklistItemData;
  communityId: number;
  canWrite: boolean;
  role?: string;
  variant?: 'needs-attention' | 'done';
  recentEvents?: AuditEntry[];
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  onMarkNA: (item: ChecklistItemData) => void;
  onUnlink: (item: ChecklistItemData) => void;
}

function statusIcon(status: ComplianceStatus): LucideIcon {
  if (status === 'overdue') return AlertCircle;
  if (status === 'satisfied') return CheckCircle2;
  if (status === 'not_applicable') return MinusCircle;
  return Clock;
}

function statusIconColor(status: ComplianceStatus): string {
  if (status === 'overdue') return 'text-[var(--status-danger)]';
  if (status === 'satisfied') return 'text-[var(--status-success)]';
  if (status === 'not_applicable') return 'text-[var(--status-neutral)]';
  return 'text-[var(--status-warning)]';
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ok ? 'bg-status-success-bg text-status-success' : 'bg-status-warning-bg text-status-warning'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <span className="text-content-secondary">{label}</span>
    </li>
  );
}

export function ComplianceRequirementCard({
  item,
  communityId,
  canWrite,
  role,
  variant = 'needs-attention',
  recentEvents,
  onUpload,
  onLink,
  onView,
  onMarkApplicable,
  onMarkNA,
  onUnlink,
}: ComplianceRequirementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cta = resolveComplianceCta(item, canWrite, role);
  const StatusIcon = statusIcon(item.status);
  const visibility = getTemplateDefaultVisibility(item.templateKey);
  const deadline = formatDate(item.deadline);

  function dispatchCta() {
    if (!cta) return;
    switch (cta.handler) {
      case 'upload': return onUpload(item);
      case 'link': return onLink(item);
      case 'view': return onView(item);
      case 'mark_applicable': return onMarkApplicable(item);
      default: {
        const _exhaustive: never = cta.handler;
        console.error('Unhandled CTA handler:', _exhaustive);
      }
    }
  }

  return (
    <article
      className={cn(
        'rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card',
        variant === 'done' && 'opacity-90',
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className={`mt-0.5 shrink-0 ${statusIconColor(item.status)}`}>
          <StatusIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge>
            <h3 className="text-base font-semibold text-content">{item.title}</h3>
          </div>
          {item.description && (
            <p className="mt-1 text-sm text-content-secondary">{item.description}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {cta && (
              <Button size="sm" variant="primary" onClick={dispatchCta}>
                {cta.label}
              </Button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2"
            >
              {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-edge-subtle px-4 py-4">
          <ul className="flex flex-col gap-2" aria-label="Status checks">
            <StatusCheck ok={!!item.documentId} label="Document on file" />
            <StatusCheck ok={!!item.documentPostedAt} label="Posted to owner portal" />
            <StatusCheck ok label="Audit trail recorded" />
          </ul>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {item.statuteReference && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Statute</dt>
                <dd className="text-content-secondary">{item.statuteReference}</dd>
              </div>
            )}
            {deadline && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Deadline</dt>
                <dd className="text-content-secondary">{deadline}</dd>
              </div>
            )}
            {item.rollingWindow?.months ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Posting window</dt>
                <dd className="text-content-secondary">Rolling {item.rollingWindow.months} mo</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wider text-content-tertiary">Visibility</dt>
              <dd className="text-content-secondary">{VISIBILITY_LABEL[visibility]}</dd>
            </div>
          </dl>

          {HELP_TEXT[item.templateKey] && (
            <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--status-info-bg)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--status-info)]">
                What&apos;s required?
              </p>
              <p className="mt-1 text-sm text-[var(--status-info)]">{HELP_TEXT[item.templateKey]}</p>
            </div>
          )}

          {canWrite ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
              <ComplianceItemActions
                item={item}
                communityId={communityId}
                onUpload={() => onUpload(item)}
                onLink={() => onLink(item)}
                onMarkNA={() => onMarkNA(item)}
                onMarkApplicable={() => onMarkApplicable(item)}
                onUnlink={() => onUnlink(item)}
              />
            </div>
          ) : item.documentId ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
              <Button size="sm" variant="secondary" onClick={() => onView(item)}>
                View document
              </Button>
            </div>
          ) : null}

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">Recent activity</h4>
            {recentEvents && recentEvents.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-content-secondary">
                {recentEvents.map((e) => (
                  <li key={e.id}>
                    {formatDate(e.createdAt) ?? e.createdAt}
                    {' — '}
                    {e.action.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-content-secondary">No recent activity.</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default ComplianceRequirementCard;
