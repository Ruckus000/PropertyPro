/**
 * Admin Join Requests — GET /api/v1/admin/join-requests
 *
 * Lists pending join requests for the caller's active community.
 * Requires residents.write permission.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { listPendingJoinRequestsForCommunity } from '@/lib/join-requests/approve-request';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'residents', 'write');

  const rows = await listPendingJoinRequestsForCommunity(communityId);

  return NextResponse.json({ data: rows });
});
