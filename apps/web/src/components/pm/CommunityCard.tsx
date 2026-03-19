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
import { StatusBadge } from '@/components/shared/status-badge';
import type { PmCommunityPortfolioCard } from '@/lib/api/pm-communities';

const COMMUNITY_TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

const COMMUNITY_TYPE_COLORS: Record<string, string> = {
  condo_718: 'bg-status-info-bg text-status-info',
  hoa_720: 'bg-status-success-bg text-status-success',
  apartment: 'bg-status-brand-bg text-status-brand',
};

interface CommunityCardProps {
  community: PmCommunityPortfolioCard;
}

export function CommunityCard({ community }: CommunityCardProps) {
  const features = getFeaturesForCommunity(community.communityType);
  const typeBadgeColor =
    COMMUNITY_TYPE_COLORS[community.communityType] ?? 'bg-status-neutral-bg text-status-neutral';
  const typeLabel = COMMUNITY_TYPE_LABELS[community.communityType] ?? community.communityType;

  return (
    <Link
      href={`/pm/dashboard/${community.communityId}`}
      className="block rounded-md border border-edge bg-surface-card p-5 shadow-e0 transition-shadow duration-quick hover:shadow-e1 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      aria-label={`Open dashboard for ${community.communityName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-content leading-tight">
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
          <dt className="text-content-tertiary">Total Units</dt>
          <dd className="mt-0.5 font-medium text-content">{community.totalUnits}</dd>
        </div>

        <div>
          <dt className="text-content-tertiary">Residents</dt>
          <dd className="mt-0.5 font-medium text-content">{community.residentCount}</dd>
        </div>

        <div>
          <dt className="text-content-tertiary">Open Maintenance</dt>
          <dd className="mt-0.5 font-medium">
            <StatusBadge
              status={community.openMaintenanceRequests === 0 ? 'compliant' : 'pending'}
              label={community.openMaintenanceRequests === 0 ? 'None' : String(community.openMaintenanceRequests)}
              size="sm"
              subtle
            />
          </dd>
        </div>

        {features.hasCompliance && (
          <div>
            <dt className="text-content-tertiary">Compliance Outstanding</dt>
            <dd className="mt-0.5 font-medium">
              <StatusBadge
                status={community.unsatisfiedComplianceItems === 0 ? 'compliant' : 'overdue'}
                label={String(community.unsatisfiedComplianceItems)}
                size="sm"
                subtle
              />
            </dd>
          </div>
        )}

        {features.hasLeaseTracking && (
          <div>
            <dt className="text-content-tertiary">Occupancy</dt>
            <dd className="mt-0.5 font-medium text-content">
              {community.occupancyRate !== null ? (
                <>
                  {community.occupancyRate}%{' '}
                  <span className="font-normal text-content-tertiary">
                    ({community.occupiedUnits}/{community.totalUnits})
                  </span>
                </>
              ) : (
                <span className="text-content-disabled">&mdash;</span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
