import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import * as esignService from '@/lib/services/esign-service';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id } = await params;
    const url = new URL(req.url);
    const communityId = Number(url.searchParams.get('communityId'));
    const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
    await requireCommunityMembership(effectiveCommunityId, userId);

    const slug = await esignService.getSignerSlug(
      effectiveCommunityId,
      Number(id),
      userId,
    );
    if (!slug) {
      throw new ForbiddenError('You are not an authorized signer for this submission');
    }

    return NextResponse.json({ data: { slug } });
  },
);
