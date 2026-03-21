/**
 * Route-level helpers for e-sign API endpoints.
 *
 * Mirrors the pattern used by violations (requireViolationsEnabled, etc.)
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

export function requireEsignEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasEsign) {
    throw new ForbiddenError('E-Sign is not enabled for this community type');
  }
}

export async function requireEsignReadPermission(membership: CommunityMembership): Promise<void> {
  requireEsignEnabled(membership);
  await requirePlanFeature(membership.communityId, 'hasEsign');
  requirePermission(membership, 'esign', 'read');
}

export async function requireEsignWritePermission(membership: CommunityMembership): Promise<void> {
  requireEsignEnabled(membership);
  await requirePlanFeature(membership.communityId, 'hasEsign');
  requirePermission(membership, 'esign', 'write');
}
