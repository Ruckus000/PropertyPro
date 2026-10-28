/**
 * `/api/v1/community/profile` — see ./contract.ts for what the profile is and
 * the rules a write is held to.
 *
 * GET   → `{ data: <the profile> }`
 * PATCH → `{ data: <the profile as it now stands> }`
 *
 * Both verbs are for community admins only. Gates, in order:
 *   GET   session, membership, the lapsed-subscription read gate, then admin.
 *   PATCH session, demo grace, membership, then admin (the demo-grace check
 *         precedes membership, per .claude/rules/api-patterns.md).
 * The community id is resolved first, by the runner, from the contract's
 * `tenantScope` (the `x-community-id` header is authoritative).
 *
 * The service writes the audit row (`community_profile`), and only for the keys
 * that changed; see `updateCommunityProfile`.
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  getCommunityProfile,
  updateCommunityProfile,
} from '@/lib/services/community-profile-service';
import { communityProfileGetContract, communityProfilePatchContract } from './contract';

export const GET = withErrorHandler(
  runRoute(communityProfileGetContract, async ({ communityId }) => {
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads. Residents are refused just below.
    await requireEntitledForAdminRead(communityId, membership);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can view the community profile');
    }

    return getCommunityProfile(communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(communityProfilePatchContract, async ({ body, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);

    if (!membership.isAdmin) {
      throw new ForbiddenError('Only admins can update the community profile');
    }

    // The runner has already injected `communityId`; what is left in the body is
    // exactly the fields the caller sent (an absent key is absent here, not
    // undefined), so the service leaves everything else alone.
    const { communityId: _communityId, ...patch } = body;

    return updateCommunityProfile(communityId, patch, { actorUserId: userId });
  }),
);
