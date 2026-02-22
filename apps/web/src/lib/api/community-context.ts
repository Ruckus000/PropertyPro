/**
 * PM Community Context Resolver — P3-46
 *
 * Server-side helper that validates a PM user's access to a specific community
 * and returns the appropriate dashboard URL based on community features.
 *
 * Security guarantees:
 * - communityId must be a positive integer (prevents injection)
 * - membership is verified server-side via requireCommunityMembership
 * - user must hold property_manager_admin role in that community
 * - returns null on any invalid/removed/non-PM access (no data leakage)
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requireCommunityMembership } from '@/lib/api/community-membership';

/**
 * Resolves the PM dashboard target URL for a given community.
 *
 * @returns The target URL string when access is valid, or null when:
 *   - communityId is not a positive integer
 *   - user has no membership in the community
 *   - user does not hold property_manager_admin role
 */
export async function resolvePmDashboardTarget(
  userId: string,
  communityId: number,
): Promise<string | null> {
  // Validate communityId is a positive integer
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return null;
  }

  try {
    const membership = await requireCommunityMembership(communityId, userId);

    // Require property_manager_admin role specifically
    if (membership.role !== 'property_manager_admin') {
      return null;
    }

    // Route by community feature flags — never by direct communityType check
    const features = getFeaturesForCommunity(membership.communityType);
    if (features.hasLeaseTracking) {
      return `/dashboard/apartment?communityId=${communityId}`;
    }
    return `/dashboard?communityId=${communityId}`;
  } catch {
    // requireCommunityMembership throws ForbiddenError for non-members;
    // treat all errors as null (no data leakage)
    return null;
  }
}
