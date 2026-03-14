import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requireCalendarSyncEnabled(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasCalendarSync) {
    throw new ForbiddenError('Calendar sync is not enabled for this community type');
  }
}

export function requireCalendarSyncEnabledForMembership(
  membership: CommunityMembership,
): void {
  requireCalendarSyncEnabled(membership.communityType);
}

export function requireCalendarSyncReadPermission(
  membership: CommunityMembership,
): void {
  requirePermission(membership, 'calendar_sync', 'read');
}

export function requireCalendarSyncWritePermission(
  membership: CommunityMembership,
): void {
  requirePermission(membership, 'calendar_sync', 'write');
}
