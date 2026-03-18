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

interface ViolationCardProps {
  violation: ViolationLike;
  communityId: number;
}

export function ViolationCard({ violation, communityId }: ViolationCardProps) {
  const statusStyle = STATUS_STYLES[violation.status] ?? 'bg-gray-100 text-gray-700';
  const severityStyle = SEVERITY_STYLES[violation.severity] ?? 'bg-gray-100 text-gray-700';
  const categoryLabel = CATEGORY_LABELS[violation.category] ?? violation.category;
  const statusLabel = STATUS_LABELS[violation.status] ?? violation.status;

  return (
    <Link
      href={`/violations/${violation.id}?communityId=${communityId}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              #{violation.id} &middot; {categoryLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
              {statusLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityStyle}`}>
              {violation.severity}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-600">{violation.description}</p>
        </div>
        <time className="shrink-0 text-xs text-gray-400">
          {new Date(violation.createdAt).toLocaleDateString()}
        </time>
      </div>
    </Link>
  );
}
