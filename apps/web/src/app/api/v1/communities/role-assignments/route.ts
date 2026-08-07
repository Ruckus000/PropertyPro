/**
 * POST/DELETE /api/v1/communities/role-assignments (role-v3 Phase 2c,
 * root-initiated).
 *
 * The community's root_manager assigns or revokes the property_manager role
 * for another member. Authorization is the explicit root-identity check
 * below (no RBAC gate — see contract.ts).
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRootManager } from '@/lib/api/role-guard';
import {
  assignPropertyManager,
  revokePropertyManager,
} from '@/lib/services/role-management-service';
import { assignRoleContract, revokeRoleContract } from './contract';

async function requireRoot(communityId: number): Promise<string> {
  const callerId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, callerId);
  requireRootManager(membership, 'Only the root manager can manage roles.');
  return callerId;
}

export const POST = withErrorHandler(
  runRoute(assignRoleContract, async ({ body, communityId }) => {
    const callerId = await requireRoot(communityId);
    return assignPropertyManager(communityId, body.userId, callerId);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(revokeRoleContract, async ({ body, communityId }) => {
    const callerId = await requireRoot(communityId);
    return revokePropertyManager(communityId, body.userId, callerId);
  }),
);
