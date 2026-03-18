'use client';

/**
 * Full detail view for a single violation.
 * Used on the standalone detail page (/violations/[id]).
 * Shows all fields, status timeline, and admin actions.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { ViolationRecord } from '@/lib/services/violations-service';
import { ViolationStatusTransition } from './ViolationStatusTransition';
import { FinesSummary } from './FinesSummary';
import type { ViolationItem, ViolationFineItem } from '@/lib/api/violations';

const STATUS_STYLES: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  noticed: 'bg-blue-100 text-blue-800',
  hearing_scheduled: 'bg-purple-100 text-purple-800',
  fined: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
};

const SEVERITY_STYLES: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-800',
  moderate: 'bg-orange-100 text-orange-800',
  major: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  noticed: 'Noticed',
  hearing_scheduled: 'Hearing Scheduled',
  fined: 'Fined',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

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

interface ViolationDetailViewProps {
  violation: ViolationRecord;
  communityId: number;
  userId: string;
  isAdmin: boolean;
  fines?: ViolationFineItem[];
}

export function ViolationDetailView({
  violation,
  communityId,
  userId,
  isAdmin,
  fines,
}: ViolationDetailViewProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);

  const statusStyle = STATUS_STYLES[violation.status] ?? 'bg-gray-100 text-gray-700';
  const severityStyle = SEVERITY_STYLES[violation.severity] ?? 'bg-gray-100 text-gray-700';
  const actions = isAdmin ? getAvailableActions(violation.status) : [];

  // Map ViolationRecord to ViolationItem shape for the transition component
  const violationItem: ViolationItem = {
    id: violation.id,
    communityId: violation.communityId,
    unitId: violation.unitId,
    reportedByUserId: violation.reportedByUserId,
    category: violation.category,
    description: violation.description,
    status: violation.status,
    severity: violation.severity,
    evidenceDocumentIds: violation.evidenceDocumentIds,
    noticeDate: violation.noticeDate,
    hearingDate: violation.hearingDate ? new Date(violation.hearingDate).toISOString() : null,
    resolutionDate: violation.resolutionDate ? new Date(violation.resolutionDate).toISOString() : null,
    resolutionNotes: violation.resolutionNotes,
    createdAt: new Date(violation.createdAt).toISOString(),
    updatedAt: new Date(violation.updatedAt).toISOString(),
  };

  return (
    <div>
      {/* Back link */}
      <Link
        href={isAdmin ? `/violations/inbox?communityId=${communityId}` : `/violations/report?communityId=${communityId}`}
        className="mb-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
      >
        &larr; Back to {isAdmin ? 'Violations Inbox' : 'Your Reports'}
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Violation #{violation.id}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {CATEGORY_LABELS[violation.category] ?? violation.category} &middot; Unit {violation.unitId}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusStyle}`}>
              {STATUS_LABELS[violation.status] ?? violation.status}
            </span>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${severityStyle}`}>
              {violation.severity}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">Description</h2>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{violation.description}</p>
      </section>

      {/* Timeline / Dates */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Timeline</h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">Reported:</span>{' '}
            <span className="text-gray-700">{new Date(violation.createdAt).toLocaleString()}</span>
          </div>
          {violation.noticeDate && (
            <div>
              <span className="text-gray-500">Notice Sent:</span>{' '}
              <span className="text-gray-700">{violation.noticeDate}</span>
            </div>
          )}
          {violation.hearingDate && (
            <div>
              <span className="text-gray-500">Hearing Date:</span>{' '}
              <span className="text-gray-700">{new Date(violation.hearingDate).toLocaleString()}</span>
            </div>
          )}
          {violation.resolutionDate && (
            <div>
              <span className="text-gray-500">
                {violation.status === 'dismissed' ? 'Dismissed:' : 'Resolved:'}
              </span>{' '}
              <span className="text-gray-700">{new Date(violation.resolutionDate).toLocaleString()}</span>
            </div>
          )}
        </div>
      </section>

      {/* Resolution notes */}
      {violation.resolutionNotes && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">
            {violation.status === 'dismissed' ? 'Dismissal Reason' : 'Resolution Notes'}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{violation.resolutionNotes}</p>
        </section>
      )}

      {/* Evidence */}
      {violation.evidenceDocumentIds.length > 0 && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">
            Evidence ({violation.evidenceDocumentIds.length} document{violation.evidenceDocumentIds.length !== 1 ? 's' : ''})
          </h2>
          <p className="text-sm text-gray-500">
            Document IDs: {violation.evidenceDocumentIds.join(', ')}
          </p>
        </section>
      )}

      {/* Fines */}
      {fines && <FinesSummary fines={fines} />}

      {/* Admin actions */}
      {isAdmin && actions.length > 0 && !activeAction && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Actions</h2>
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
        </section>
      )}

      {/* Active transition form */}
      {activeAction && (
        <section className="mb-6">
          <ViolationStatusTransition
            violation={violationItem}
            communityId={communityId}
            action={activeAction}
            onComplete={() => window.location.reload()}
            onCancel={() => setActiveAction(null)}
          />
        </section>
      )}
    </div>
  );
}
