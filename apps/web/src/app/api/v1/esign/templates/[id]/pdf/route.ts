import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { getTemplate } from '@/lib/services/esign-service';
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

    const template = await getTemplate(communityId, id);

    let pdfUrl: string | null = null;
    if (template.sourceDocumentPath) {
      try {
        pdfUrl = await createPresignedDownloadUrl('documents', template.sourceDocumentPath);
      } catch {
        pdfUrl = null;
      }
    }

    if (!pdfUrl) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No PDF available for this template' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { pdfUrl } });
  },
);
