/**
 * Join-request eligibility checks.
 *
 * A user is ELIGIBLE to submit a join request for a community when all of:
 *   1. They do not already have an active user_roles row in that community.
 *   2. They do not already have a pending join request for that community.
 *   3. They have not been denied for that community within the last 30 days.
 *
 * Cross-community reads: this module queries user_roles and community_join_requests
 * across tenants before the user has a role, so it uses the unscoped client.
 * Authorization contract: the caller MUST have already authenticated the userId
 * via requireAuthenticatedUserId().
 */
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { userRoles, communityJoinRequests } from '@propertypro/db';
import { and, eq, gte } from '@propertypro/db/filters';

export type EligibilityReason = 'already_member' | 'pending_request' | 'recently_denied';

export interface EligibilityInput {
  userId: string;
  communityId: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
}

const DENIAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function checkJoinRequestEligibility(
  input: EligibilityInput,
): Promise<EligibilityResult> {
  const db = createUnscopedClient();

  // 1. Already a member?
  const [existingRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, input.userId),
        eq(userRoles.communityId, input.communityId),
      ),
    )
    .limit(1);

  if (existingRole) {
    return { eligible: false, reason: 'already_member' };
  }

  // 2. Pending request?
  const [pending] = await db
    .select({ id: communityJoinRequests.id })
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.userId, input.userId),
        eq(communityJoinRequests.communityId, input.communityId),
        eq(communityJoinRequests.status, 'pending'),
      ),
    )
    .limit(1);

  if (pending) {
    return { eligible: false, reason: 'pending_request' };
  }

  // 3. Denied within last 30 days?
  const thirtyDaysAgo = new Date(Date.now() - DENIAL_COOLDOWN_MS);
  const [recentDenial] = await db
    .select({ id: communityJoinRequests.id })
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.userId, input.userId),
        eq(communityJoinRequests.communityId, input.communityId),
        eq(communityJoinRequests.status, 'denied'),
        gte(communityJoinRequests.reviewedAt, thirtyDaysAgo),
      ),
    )
    .limit(1);

  if (recentDenial) {
    return { eligible: false, reason: 'recently_denied' };
  }

  return { eligible: true };
}
