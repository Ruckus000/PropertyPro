/**
 * Meetings — meeting detail
 *
 * GET /api/v1/meetings/[id]?communityId=N
 *
 * Plan A1 bundle drain #37. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → requirePermission('meetings', 'read')
 *   → getMeetingDetail(communityId, meetingId) → 404 NotFoundError if missing
 *   → listMeetingDocumentLinks + listMeetingAttachedDocuments
 *   → getDocumentCategoryNames
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` / missing
 * or non-numeric `communityId` shifts to the canonical `VALIDATION_ERROR`
 * envelope (was `BadRequestError('Invalid meeting ID')` for `[id]`). Status
 * unchanged at 400. Success wire shape `{ data: { ...meeting, documents } }`
 * byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { NotFoundError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { serializeMeetingResponse } from '@/lib/meetings/meeting-response';
import {
  getMeetingDetail,
  listMeetingAttachedDocuments,
  listMeetingDocumentLinks,
} from '@/lib/services/meeting-service';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';
import { meetingsDetailGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(meetingsDetailGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const meetingId = params.id;
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'meetings', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

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

    return {
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
    };
  }),
);
