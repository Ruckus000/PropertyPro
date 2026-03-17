import Link from 'next/link';
import type { DashboardViolationSummary } from '@/lib/dashboard/dashboard-selectors';

const STATUS_STYLES: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  noticed: 'bg-blue-100 text-blue-800',
  hearing_scheduled: 'bg-purple-100 text-purple-800',
  fined: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
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
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Violations</h2>
        {isAdmin ? (
          <Link
            href={`/violations/inbox?communityId=${communityId}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            View All
          </Link>
        ) : (
          <Link
            href={`/violations/report?communityId=${communityId}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
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
              <span
                key={status}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {STATUS_LABELS[status] ?? status}: {count}
              </span>
            ))}
        </div>
      )}

      {/* Recent violations list */}
      <div className="mt-4 space-y-3">
        {summary.recentViolations.length === 0 ? (
          <p className="text-base text-gray-600">No violations reported.</p>
        ) : (
          summary.recentViolations.map((v) => (
            <Link
              key={v.id}
              href={`/violations/${v.id}?communityId=${communityId}`}
              className="block rounded-md border border-gray-100 p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">
                    {CATEGORY_LABELS[v.category] ?? v.category}
                  </span>
                  <span className="ml-2 text-gray-500">Unit {v.unitId}</span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {STATUS_LABELS[v.status] ?? v.status}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
