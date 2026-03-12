import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requirePollsEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasPolls) {
    throw new ForbiddenError('Polls are not enabled for this community type');
  }
}

export function requireCommunityBoardEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasCommunityBoard) {
    throw new ForbiddenError('Community board is not enabled for this community type');
  }
}

export function requirePollReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'polls', 'read');
}

export function requirePollWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'polls', 'write');
}

export function requirePollCreatorRole(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only community leaders can create polls');
  }
}

export function requireForumModerationPermission(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only forum moderators can perform this action');
  }
}
