import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requireElectionsEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasVoting) {
    throw new ForbiddenError('Elections are not enabled for this community type');
  }

  if (!membership.electionsAttorneyReviewed) {
    throw new ForbiddenError('Elections are not available until attorney review is complete');
  }
}

export function requireElectionsReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'elections', 'read');
}

export function requireElectionsWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'elections', 'write');
}

export function requireElectionsAdminRole(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only community leaders can manage elections');
  }
}
