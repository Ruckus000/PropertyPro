'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@propertypro/ui';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import { statusLabel, statusVariant } from './compliance-pill-mapping';
import type { ChecklistItemData } from './compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';

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

  function dispatchCta() {
    if (!cta) return;
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  return (
    <article
      className={`rounded-[var(--radius-md)] border bg-surface-card ${
        variant === 'done' ? 'border-edge-subtle opacity-90' : 'border-edge-subtle'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
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
    </article>
  );
}

export default ComplianceRequirementCard;
