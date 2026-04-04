import type { RbacResource } from '@/lib/db/access-control';
import type { CommunityFeatures } from '@propertypro/shared';
import type { ResourceAccessMap } from '@/lib/db/access-control';

export type SearchGroupKey =
  | 'documents'
  | 'announcements'
  | 'meetings'
  | 'maintenance'
  | 'violations'
  | 'residents';

export interface SearchGroupConfig {
  key: SearchGroupKey;
  label: string;
  resource: RbacResource;
  adminOnly?: boolean;
  featureFlag?: keyof CommunityFeatures;
}

export const SEARCH_GROUPS: readonly SearchGroupConfig[] = [
  { key: 'documents', label: 'Documents', resource: 'documents' },
  { key: 'announcements', label: 'Announcements', resource: 'announcements' },
  { key: 'meetings', label: 'Meetings', resource: 'meetings', featureFlag: 'hasMeetings' },
  {
    key: 'maintenance',
    label: 'Maintenance',
    resource: 'maintenance',
    featureFlag: 'hasMaintenanceRequests',
  },
  { key: 'violations', label: 'Violations', resource: 'violations', featureFlag: 'hasViolations' },
  { key: 'residents', label: 'Residents', resource: 'residents', adminOnly: true },
] as const;

export function getEnabledSearchGroups(
  isAdmin: boolean,
  features: CommunityFeatures | null,
  resourceAccess: ResourceAccessMap | null,
): readonly SearchGroupConfig[] {
  return SEARCH_GROUPS.filter((group) => {
    if (group.adminOnly && !isAdmin) {
      return false;
    }

    if (group.featureFlag && features && !features[group.featureFlag]) {
      return false;
    }

    if (resourceAccess && !resourceAccess[group.resource]?.read) {
      return false;
    }

    return true;
  });
}
