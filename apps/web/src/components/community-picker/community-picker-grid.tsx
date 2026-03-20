import type { UserCommunityRow } from '@/lib/api/user-communities';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';

const COMMUNITY_TYPE_COLORS: Record<string, string> = {
  condo_718: 'bg-interactive-muted text-content-link',
  hoa_720: 'bg-status-success-bg text-status-success',
  apartment: 'bg-status-info-bg text-status-info',
};

const ROLE_LABELS: Record<string, string> = {
  resident: 'Resident',
  manager: 'Manager',
  pm_admin: 'Property Manager',
  // Legacy labels (backward compat during migration)
  owner: 'Owner',
  tenant: 'Tenant',
  board_member: 'Board Member',
  board_president: 'Board President',
  cam: 'CAM',
  site_manager: 'Site Manager',
  property_manager_admin: 'Property Manager',
};

function getRoleLabel(community: UserCommunityRow): string {
  if (community.displayTitle) {
    return community.displayTitle;
  }
  if (community.role === 'resident') {
    return community.isUnitOwner ? 'Owner' : 'Tenant';
  }
  return ROLE_LABELS[community.role] ?? community.role;
}

interface CommunityPickerGridProps {
  communities: UserCommunityRow[];
}

export function CommunityPickerGrid({ communities }: CommunityPickerGridProps) {
  return (
    <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((community) => (
        <li key={community.communityId}>
          <a
            href={`/dashboard?communityId=${community.communityId}`}
            className="block rounded-md border border-edge bg-surface-card p-5 shadow-e0 transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label={`Open ${community.communityName}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold leading-tight text-content">
                {community.communityName}
              </h2>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  COMMUNITY_TYPE_COLORS[community.communityType] ?? 'bg-surface-muted text-content'
                }`}
              >
                {COMMUNITY_TYPE_DISPLAY_NAMES[community.communityType] ?? community.communityType}
              </span>
            </div>

            {(community.city || community.state) && (
              <p className="mt-1 text-sm text-content-tertiary">
                {[community.city, community.state].filter(Boolean).join(', ')}
              </p>
            )}

            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-content-disabled">
              {getRoleLabel(community)}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
