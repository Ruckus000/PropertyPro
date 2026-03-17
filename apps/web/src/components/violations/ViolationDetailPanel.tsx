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
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-green-600 text-white hover:bg-green-700',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
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
    <div className="mt-1 rounded-b-lg border border-t-0 border-gray-200 bg-white p-4">
      {/* Description */}
      <div className="mb-4">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Description</h4>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{violation.description}</p>
      </div>

      {/* Metadata */}
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</span>
          <p className="text-gray-700">{CATEGORY_LABELS[violation.category] ?? violation.category}</p>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Unit</span>
          <p className="text-gray-700">{violation.unitId}</p>
        </div>
        {violation.noticeDate && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Notice Date</span>
            <p className="text-gray-700">{violation.noticeDate}</p>
          </div>
        )}
        {violation.hearingDate && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hearing Date</span>
            <p className="text-gray-700">{new Date(violation.hearingDate).toLocaleDateString()}</p>
          </div>
        )}
        {violation.resolutionNotes && (
          <div className="col-span-2 sm:col-span-4">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Resolution Notes</span>
            <p className="whitespace-pre-wrap text-gray-700">{violation.resolutionNotes}</p>
          </div>
        )}
      </div>

      {/* Evidence */}
      {violation.evidenceDocumentIds.length > 0 && (
        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
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
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${VARIANT_STYLES[variant] ?? ''}`}
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
