/**
 * Route-level helpers for e-sign API endpoints.
 *
 * Mirrors the pattern used by violations (requireViolationsEnabled, etc.)
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requireEsignEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasEsign) {
    throw new ForbiddenError('E-Sign is not enabled for this community type');
  }
}

export function requireEsignReadPermission(membership: CommunityMembership): void {
  requireEsignEnabled(membership);
  requirePermission(membership, 'esign', 'read');
}

export function requireEsignWritePermission(membership: CommunityMembership): void {
  requireEsignEnabled(membership);
  requirePermission(membership, 'esign', 'write');
}
