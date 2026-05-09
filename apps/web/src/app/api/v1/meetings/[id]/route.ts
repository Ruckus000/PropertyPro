import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requirePermission } from '@/lib/db/access-control';
import { serializeMeetingResponse } from '@/lib/meetings/meeting-response';
import {
  getMeetingDetail,
  listMeetingAttachedDocuments,
  listMeetingDocumentLinks,
} from '@/lib/services/meeting-service';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const { id } = await params;
    const meetingId = Number(id);

    if (!Number.isInteger(meetingId) || meetingId <= 0) {
      throw new BadRequestError('Invalid meeting ID');
    }

    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'meetings', 'read');

    const meeting = await getMeetingDetail(communityId, meetingId);
    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    const linkRows = await listMeetingDocumentLinks(communityId, meetingId);
    const documentIds = linkRows.map((row) => row.documentId);
    const documentRows = await listMeetingAttachedDocuments(communityId, documentIds);

    const categoryIds = [
      ...new Set(
        documentRows
          .map((row) => row.categoryId)
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];
    const categoryNameById = await getDocumentCategoryNames(communityId, categoryIds);

    const documentById = new Map(documentRows.map((row) => [row.id, row]));

    return NextResponse.json({
      data: {
        ...serializeMeetingResponse(meeting, membership.communityType),
        documents: linkRows
          .map((link) => {
            const document = documentById.get(link.documentId);
            if (!document) {
              return null;
            }

            return {
              id: document.id,
              title: document.title,
              fileName: document.fileName,
              fileSize: document.fileSize,
              mimeType: document.mimeType,
              category: document.categoryId
                ? categoryNameById.get(document.categoryId) ?? null
                : null,
              attachedAt: link.attachedAt.toISOString(),
            };
          })
          .filter((document): document is NonNullable<typeof document> => document !== null),
      },
    });
  },
);
