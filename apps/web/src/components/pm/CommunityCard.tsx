/**
 * PM Portfolio Community Card — P3-45
 *
 * Renders a summary card for a single managed community.
 * - Condo/HOA cards show compliance outstanding count.
 * - Apartment cards show occupancy rate and occupied/total units.
 *
 * Uses feature flags (getFeaturesForCommunity) — never direct communityType checks.
 */
'use client';

import Link from 'next/link';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { PmCommunityPortfolioCard } from '@/lib/api/pm-communities';

const COMMUNITY_TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

const COMMUNITY_TYPE_COLORS: Record<string, string> = {
  condo_718: 'bg-blue-100 text-blue-800',
  hoa_720: 'bg-green-100 text-green-800',
  apartment: 'bg-purple-100 text-purple-800',
};

interface CommunityCardProps {
  community: PmCommunityPortfolioCard;
}

export function CommunityCard({ community }: CommunityCardProps) {
  const features = getFeaturesForCommunity(community.communityType);
  const typeBadgeColor =
    COMMUNITY_TYPE_COLORS[community.communityType] ?? 'bg-gray-100 text-gray-800';
  const typeLabel = COMMUNITY_TYPE_LABELS[community.communityType] ?? community.communityType;

  return (
    <Link
      href={`/pm/dashboard/${community.communityId}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`Open dashboard for ${community.communityName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 leading-tight">
          {community.communityName}
        </h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColor}`}
        >
          {typeLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-gray-500">Total Units</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{community.totalUnits}</dd>
        </div>

        <div>
          <dt className="text-gray-500">Residents</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{community.residentCount}</dd>
        </div>

        <div>
          <dt className="text-gray-500">Open Maintenance</dt>
          <dd className="mt-0.5 font-medium text-gray-900">
            {community.openMaintenanceRequests === 0 ? (
              <span className="text-green-700">None</span>
            ) : (
              <span className="text-amber-700">{community.openMaintenanceRequests}</span>
            )}
          </dd>
        </div>

        {features.hasCompliance && (
          <div>
            <dt className="text-gray-500">Compliance Outstanding</dt>
            <dd className="mt-0.5 font-medium">
              {community.unsatisfiedComplianceItems === 0 ? (
                <span className="text-green-700">0</span>
              ) : (
                <span className="text-red-700">{community.unsatisfiedComplianceItems}</span>
              )}
            </dd>
          </div>
        )}

        {features.hasLeaseTracking && (
          <div>
            <dt className="text-gray-500">Occupancy</dt>
            <dd className="mt-0.5 font-medium text-gray-900">
              {community.occupancyRate !== null ? (
                <>
                  {community.occupancyRate}%{' '}
                  <span className="text-gray-500 font-normal">
                    ({community.occupiedUnits}/{community.totalUnits})
                  </span>
                </>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
