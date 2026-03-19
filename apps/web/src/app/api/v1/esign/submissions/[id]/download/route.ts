import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { getSubmission } from '@/lib/services/esign-service';
import { createPresignedDownloadUrl } from '@propertypro/db';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireEsignReadPermission(membership);

    const { submission } = await getSubmission(communityId, id);

    if (!submission.signedDocumentPath) {
      throw new BadRequestError('No signed document available for this submission');
    }

    const downloadUrl = await createPresignedDownloadUrl(
      'documents',
      submission.signedDocumentPath,
    );

    return NextResponse.json({ data: { downloadUrl } });
  },
);
