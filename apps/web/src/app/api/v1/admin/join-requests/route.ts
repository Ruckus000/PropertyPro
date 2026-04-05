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
import { createScopedClient, communityJoinRequests } from '@propertypro/db';
import { and, desc, eq } from '@propertypro/db/filters';

interface JoinRequestRow {
  id: number;
  userId: string;
  communityId: number;
  unitIdentifier: string;
  residentType: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'residents', 'write');

  const db = createScopedClient(communityId);
  const rows = await db
    .selectFrom<JoinRequestRow>(
      communityJoinRequests,
      {
        id: communityJoinRequests.id,
        userId: communityJoinRequests.userId,
        communityId: communityJoinRequests.communityId,
        unitIdentifier: communityJoinRequests.unitIdentifier,
        residentType: communityJoinRequests.residentType,
        status: communityJoinRequests.status,
        reviewedBy: communityJoinRequests.reviewedBy,
        reviewedAt: communityJoinRequests.reviewedAt,
        reviewNotes: communityJoinRequests.reviewNotes,
        createdAt: communityJoinRequests.createdAt,
        updatedAt: communityJoinRequests.updatedAt,
      },
      and(
        eq(communityJoinRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(communityJoinRequests.createdAt));

  return NextResponse.json({ data: rows });
});
