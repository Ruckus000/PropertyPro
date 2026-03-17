/**
 * Emergency Broadcast Templates API — list pre-built templates.
 *
 * GET /api/v1/emergency-broadcasts/templates — List all templates
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { EMERGENCY_TEMPLATES } from '@/lib/constants/emergency-templates';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
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

  return NextResponse.json({ data: EMERGENCY_TEMPLATES });
});
