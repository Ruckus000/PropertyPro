import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import * as esignService from '@/lib/services/esign-service';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'read');

    const submission = await esignService.getSubmission(effectiveCommunityId, Number(id));
    if (!submission) throw new NotFoundError('Submission not found');

    const signers = await esignService.getSubmissionSigners(
      effectiveCommunityId,
      Number(id),
    );

    return NextResponse.json({ data: { ...submission, signers } });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership.role, membership.communityType, 'esign', 'write');

    const cancelled = await esignService.cancelSubmission(
      effectiveCommunityId,
      Number(id),
      userId,
    );
    if (!cancelled) throw new NotFoundError('Submission not found or not cancellable');

    return NextResponse.json({ data: { cancelled: true, id: Number(id) } });
  },
);
