/**
 * POST /api/v1/communities/delete
 * DELETE /api/v1/communities/delete (cancel)
 *
 * Community admin requests or cancels community deletion.
 * Community ID from x-community-id header (set by middleware).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  findCoolingCommunityDeletionRequest,
  interveneCommunityDeletion,
  requestCommunityDeletion,
} from '@/lib/services/account-lifecycle-service';
import { AppError } from '@/lib/api/errors/AppError';

// POST — request community deletion
export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');

  const request = await requestCommunityDeletion(communityId, userId);
  return NextResponse.json({ data: request });
});

// DELETE — cancel community deletion
export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');

  const activeRequestId = await findCoolingCommunityDeletionRequest(communityId);
  if (activeRequestId === null) {
    throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
  }

  await interveneCommunityDeletion(activeRequestId, {
    adminUserId: userId,
    notes: 'Cancelled by community administrator',
  });
  return NextResponse.json({ data: { cancelled: true } });
});
