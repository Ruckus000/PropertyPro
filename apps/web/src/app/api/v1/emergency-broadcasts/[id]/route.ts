/**
 * Emergency Broadcast detail API — get broadcast with delivery report.
 *
 * GET /api/v1/emergency-broadcasts/[id] — Get broadcast + delivery report
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { getBroadcastWithReport } from '@/lib/services/emergency-broadcast-service';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const broadcastId = Number(id);

    if (!Number.isInteger(broadcastId) || broadcastId <= 0) {
      throw new ValidationError('Invalid broadcast ID');
    }

    const { searchParams } = new URL(req.url);
    const communityIdParam = searchParams.get('communityId');
    if (!communityIdParam) {
      throw new ValidationError('communityId query parameter is required');
    }

    const parsedCommunityId = Number(communityIdParam);
    if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
      throw new ValidationError('communityId must be a positive integer');
    }

    const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'read');

    const report = await getBroadcastWithReport(broadcastId, communityId);
    if (!report) {
      throw new NotFoundError('Broadcast not found');
    }

    return NextResponse.json({ data: report });
  },
);
