import Link from 'next/link';
import type { DashboardViolationSummary } from '@/lib/dashboard/dashboard-selectors';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

const STATUS_KEY_MAP: Record<string, string> = {
  reported: 'open',
  noticed: 'submitted',
  hearing_scheduled: 'pending',
  fined: 'overdue',
  resolved: 'completed',
  dismissed: 'neutral',
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

interface DashboardViolationsProps {
  summary: DashboardViolationSummary;
  communityId: number;
  isAdmin: boolean;
}

export function DashboardViolations({ summary, communityId, isAdmin }: DashboardViolationsProps) {
  const openCount =
    (summary.byStatus['reported'] ?? 0) +
    (summary.byStatus['noticed'] ?? 0) +
    (summary.byStatus['hearing_scheduled'] ?? 0) +
    (summary.byStatus['fined'] ?? 0);

  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content">Violations</h2>
        {isAdmin ? (
          <Link
            href={`/violations/inbox?communityId=${communityId}`}
            className="text-sm font-medium text-content-link hover:text-interactive-hover"
          >
            View All
          </Link>
        ) : (
          <Link
            href={`/violations/report?communityId=${communityId}`}
            className="text-sm font-medium text-content-link hover:text-interactive-hover"
          >
            Report
          </Link>
        )}
      </div>

      {/* Status summary counts */}
      {openCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(summary.byStatus)
            .filter(([status]) => !['resolved', 'dismissed'].includes(status))
            .map(([status, count]) => (
              <StatusBadge
                key={status}
                status={STATUS_KEY_MAP[status] ?? 'neutral'}
                label={`${STATUS_LABELS[status] ?? status}: ${count}`}
                size="sm"
                subtle
              />
            ))}
        </div>
      )}

      {/* Recent violations list */}
      <div className="mt-4 space-y-3">
        {summary.recentViolations.length === 0 ? (
          <EmptyState preset="no_violations" size="sm" />
        ) : (
          summary.recentViolations.map((v) => (
            <Link
              key={v.id}
              href={`/violations/${v.id}?communityId=${communityId}`}
              className="block rounded-md border border-edge-subtle p-3 transition-colors duration-quick hover:bg-surface-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-content">
                    {CATEGORY_LABELS[v.category] ?? v.category}
                  </span>
                  <span className="ml-2 text-content-tertiary">Unit {v.unitId}</span>
                </div>
                <StatusBadge
                  status={STATUS_KEY_MAP[v.status] ?? 'neutral'}
                  label={STATUS_LABELS[v.status] ?? v.status}
                  size="sm"
                  subtle
                />
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
