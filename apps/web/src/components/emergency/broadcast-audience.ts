import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';

export type BroadcastAudience = 'all' | 'owners_only';

export const BROADCAST_AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  all: 'All residents',
  owners_only: 'Owners only',
};

/**
 * The audiences an emergency broadcast can target in this community. A
 * community with no owner role (apartments) has no owners, so "Owners only"
 * would send the alert to nobody.
 */
export function getBroadcastAudienceOptions(communityType: CommunityType): BroadcastAudience[] {
  return getFeaturesForCommunity(communityType).hasOwnerRole ? ['all', 'owners_only'] : ['all'];
}
