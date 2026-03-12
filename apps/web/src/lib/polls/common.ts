import type { CommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

const POLL_CREATOR_ROLES = new Set<CommunityRole>([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const FORUM_MODERATOR_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

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
  requirePermission(membership.role, membership.communityType, 'polls', 'read');
}

export function requirePollWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'polls', 'write');
}

export function requirePollCreatorRole(membership: CommunityMembership): void {
  if (!POLL_CREATOR_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only community leaders can create polls');
  }
}

export function requireForumModerationPermission(membership: CommunityMembership): void {
  if (!FORUM_MODERATOR_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only forum moderators can perform this action');
  }
}
