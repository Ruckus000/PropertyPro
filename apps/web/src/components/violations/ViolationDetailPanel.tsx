'use client';

/**
 * Expandable detail panel shown inline in the admin inbox when a violation row is clicked.
 * Shows full details and context-dependent status transition action buttons.
 */
import { useState } from 'react';
import type { AnyCommunityRole } from '@propertypro/shared';
import type { ViolationItem } from '@/lib/api/violations';
import { ViolationStatusTransition } from './ViolationStatusTransition';

const CATEGORY_LABELS: Record<string, string> = {
  noise: 'Noise',
  parking: 'Parking',
  unauthorized_modification: 'Unauthorized Modification',
  pet: 'Pet Violation',
  trash: 'Trash / Debris',
  common_area_misuse: 'Common Area Misuse',
  landscaping: 'Landscaping',
  property_damage: 'Property Damage',
  other: 'Other',
};

type ActionType = 'notice' | 'hearing' | 'fine' | 'resolve' | 'dismiss' | null;

function getAvailableActions(status: string): { label: string; action: ActionType; variant: string }[] {
  switch (status) {
    case 'reported':
      return [{ label: 'Send Notice', action: 'notice', variant: 'primary' }];
    case 'noticed':
      return [
        { label: 'Schedule Hearing', action: 'hearing', variant: 'primary' },
        { label: 'Impose Fine', action: 'fine', variant: 'danger' },
      ];
    case 'hearing_scheduled':
      return [
        { label: 'Impose Fine', action: 'fine', variant: 'danger' },
        { label: 'Resolve', action: 'resolve', variant: 'success' },
        { label: 'Dismiss', action: 'dismiss', variant: 'secondary' },
      ];
    case 'fined':
      return [{ label: 'Resolve', action: 'resolve', variant: 'success' }];
    default:
      return [];
  }
}

const VARIANT_STYLES: Record<string, string> = {
  primary: 'bg-interactive text-content-inverse hover:bg-interactive-hover',
  danger: 'bg-status-danger text-content-inverse hover:bg-status-danger-hover',
  success: 'bg-status-success text-content-inverse hover:bg-status-success-hover',
  secondary: 'border border-edge-strong bg-surface-card text-content-secondary hover:bg-surface-hover',
};

interface ViolationDetailPanelProps {
  violation: ViolationItem;
  communityId: number;
  userId: string;
  userRole: AnyCommunityRole;
  onActionComplete: () => void;
}

export function ViolationDetailPanel({
  violation,
  communityId,
  userId,
  userRole,
  onActionComplete,
}: ViolationDetailPanelProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);

  const actions = getAvailableActions(violation.status);

  return (
    <div className="mt-1 rounded-b-md border border-t-0 border-edge bg-surface-card p-4">
      {/* Description */}
      <div className="mb-4">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-content-tertiary">Description</h4>
        <p className="whitespace-pre-wrap text-sm text-content-secondary">{violation.description}</p>
      </div>

      {/* Metadata */}
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Category</span>
          <p className="text-content-secondary">{CATEGORY_LABELS[violation.category] ?? violation.category}</p>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Unit</span>
          <p className="text-content-secondary">{violation.unitId}</p>
        </div>
        {violation.noticeDate && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Notice Date</span>
            <p className="text-content-secondary">{violation.noticeDate}</p>
          </div>
        )}
        {violation.hearingDate && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Hearing Date</span>
            <p className="text-content-secondary">{new Date(violation.hearingDate).toLocaleDateString()}</p>
          </div>
        )}
        {violation.resolutionNotes && (
          <div className="col-span-2 sm:col-span-4">
            <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">Resolution Notes</span>
            <p className="whitespace-pre-wrap text-content-secondary">{violation.resolutionNotes}</p>
          </div>
        )}
      </div>

      {/* Evidence */}
      {violation.evidenceDocumentIds.length > 0 && (
        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wide text-content-tertiary">
            Evidence ({violation.evidenceDocumentIds.length} document{violation.evidenceDocumentIds.length !== 1 ? 's' : ''})
          </span>
        </div>
      )}

      {/* Action buttons */}
      {actions.length > 0 && !activeAction && (
        <div className="flex flex-wrap gap-2">
          {actions.map(({ label, action, variant }) => (
            <button
              key={action}
              type="button"
              onClick={() => setActiveAction(action)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors duration-quick ${VARIANT_STYLES[variant] ?? ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Active transition modal */}
      {activeAction && (
        <ViolationStatusTransition
          violation={violation}
          communityId={communityId}
          action={activeAction}
          onComplete={onActionComplete}
          onCancel={() => setActiveAction(null)}
        />
      )}
    </div>
  );
}
