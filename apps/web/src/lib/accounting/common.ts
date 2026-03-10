import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requireAccountingEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasAccountingConnectors) {
    throw new ForbiddenError('Accounting connectors are not enabled for this community type');
  }
}

export function requireAccountingReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'accounting', 'read');
}

export function requireAccountingWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'accounting', 'write');
}
