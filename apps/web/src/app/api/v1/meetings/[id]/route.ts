import { NextResponse, type NextRequest } from 'next/server';
import {
  createScopedClient,
  documentCategories,
  documents,
  meetingDocuments,
  meetings,
} from '@propertypro/db';
import { asc, eq, inArray } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requirePermission } from '@/lib/db/access-control';
import {
  serializeMeetingResponse,
  type MeetingResponseRecord,
} from '@/lib/meetings/meeting-response';

interface MeetingDocumentLinkRow {
  [key: string]: unknown;
  documentId: number;
  attachedAt: Date;
}

interface MeetingDocumentRow {
  [key: string]: unknown;
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  categoryId: number | null;
}

interface DocumentCategoryRow {
  [key: string]: unknown;
  id: number;
  name: string;
}

// parseCommunityIdFromQuery imported from @/lib/finance/request

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

    const scoped = createScopedClient(communityId);
    const meetingRows = await scoped.selectFrom<MeetingResponseRecord>(
      meetings,
      {
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
        location: meetings.location,
        noticePostedAt: meetings.noticePostedAt,
        minutesApprovedAt: meetings.minutesApprovedAt,
      },
      eq(meetings.id, meetingId),
    );
    const meeting = meetingRows[0];

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    const linkRows = await scoped
      .selectFrom<MeetingDocumentLinkRow>(
        meetingDocuments,
        {
          documentId: meetingDocuments.documentId,
          attachedAt: meetingDocuments.attachedAt,
        },
        eq(meetingDocuments.meetingId, meetingId),
      )
      .orderBy(asc(meetingDocuments.attachedAt), asc(meetingDocuments.documentId));

    const documentIds = linkRows.map((row) => row.documentId);
    const documentRows = documentIds.length === 0
      ? []
      : await scoped.selectFrom<MeetingDocumentRow>(
          documents,
          {
            id: documents.id,
            title: documents.title,
            fileName: documents.fileName,
            fileSize: documents.fileSize,
            mimeType: documents.mimeType,
            categoryId: documents.categoryId,
          },
          inArray(documents.id, documentIds),
        );

    const categoryIds = [
      ...new Set(
        documentRows
          .map((row) => row.categoryId)
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];
    const categoryRows = categoryIds.length === 0
      ? []
      : await scoped.selectFrom<DocumentCategoryRow>(
          documentCategories,
          {
            id: documentCategories.id,
            name: documentCategories.name,
          },
          inArray(documentCategories.id, categoryIds),
        );

    const documentById = new Map(documentRows.map((row) => [row.id, row]));
    const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));

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
