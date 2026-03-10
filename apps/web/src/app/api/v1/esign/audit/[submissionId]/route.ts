import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import * as esignService from '@/lib/services/esign-service';

export const GET = withErrorHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ submissionId: string }> },
  ) => {
    const userId = await requireAuthenticatedUserId();
    const { submissionId } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'write');

    const submission = await esignService.getSubmission(
      effectiveCommunityId,
      Number(submissionId),
    );
    if (!submission) throw new NotFoundError('Submission not found');

    const events = await esignService.getAuditTrail(
      effectiveCommunityId,
      Number(submissionId),
    );

    return NextResponse.json({ data: events });
  },
);
