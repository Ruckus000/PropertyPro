import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { getSubmission, getTemplate } from '@/lib/services/esign-service';
import { createPresignedDownloadUrl } from '@propertypro/db';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);

    const data = await getSubmission(communityId, id);
    const template = await getTemplate(communityId, data.submission.templateId);

    const previewPath =
      data.submission.signedDocumentPath ?? template.sourceDocumentPath ?? null;

    let previewPdfUrl: string | null = null;
    if (previewPath) {
      try {
        previewPdfUrl = await createPresignedDownloadUrl('documents', previewPath);
      } catch {
        previewPdfUrl = null;
      }
    }

    let downloadUrl: string | null = null;
    if (data.submission.signedDocumentPath) {
      try {
        downloadUrl = await createPresignedDownloadUrl(
          'documents',
          data.submission.signedDocumentPath,
        );
      } catch {
        downloadUrl = null;
      }
    }

    return NextResponse.json({
      data: {
        ...data,
        previewPdfUrl,
        downloadUrl,
      },
    });
  },
);
