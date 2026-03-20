'use client';

/**
 * Compact display card for a single violation.
 * Used in the owner's report page to show their submitted violations.
 */
import Link from 'next/link';
interface ViolationLike {
  id: number;
  category: string;
  description: string;
  status: string;
  severity: string;
  createdAt: string | Date;
}

const STATUS_STYLES: Record<string, string> = {
  reported: 'bg-status-warning-bg text-status-warning',
  noticed: 'bg-interactive-muted text-content-link',
  hearing_scheduled: 'bg-status-brand-bg text-status-brand',
  fined: 'bg-status-danger-bg text-status-danger',
  resolved: 'bg-status-success-bg text-status-success',
  dismissed: 'bg-surface-muted text-content-secondary',
};

const SEVERITY_STYLES: Record<string, string> = {
  minor: 'bg-status-warning-bg text-status-warning',
  moderate: 'bg-status-warning-bg text-status-warning',
  major: 'bg-status-danger-bg text-status-danger',
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

interface ViolationCardProps {
  violation: ViolationLike;
  communityId: number;
}

export function ViolationCard({ violation, communityId }: ViolationCardProps) {
  const statusStyle = STATUS_STYLES[violation.status] ?? 'bg-surface-muted text-content-secondary';
  const severityStyle = SEVERITY_STYLES[violation.severity] ?? 'bg-surface-muted text-content-secondary';
  const categoryLabel = CATEGORY_LABELS[violation.category] ?? violation.category;
  const statusLabel = STATUS_LABELS[violation.status] ?? violation.status;

  return (
    <Link
      href={`/violations/${violation.id}?communityId=${communityId}`}
      className="block rounded-md border border-edge bg-surface-card p-4 transition-colors duration-quick hover:border-edge-strong hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-content">
              #{violation.id} &middot; {categoryLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
              {statusLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityStyle}`}>
              {violation.severity}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-content-secondary">{violation.description}</p>
        </div>
        <time className="shrink-0 text-xs text-content-disabled">
          {new Date(violation.createdAt).toLocaleDateString()}
        </time>
      </div>
    </Link>
  );
}
