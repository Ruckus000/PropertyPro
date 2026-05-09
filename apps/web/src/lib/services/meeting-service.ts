/**
 * Meeting Service
 *
 * Tenant-scoped lookups for the `meetings` table and its companions
 * (`meeting_documents`, the join into `documents`). First helpers added by
 * A3 drain #50 for the meetings detail route; future drains of related
 * routes (list, create, agenda, attendance) will collect their helpers
 * here.
 */
import { createScopedClient, documents, meetingDocuments, meetings } from '@propertypro/db';
import { asc, eq, inArray } from '@propertypro/db/filters';
import type { MeetingResponseRecord } from '@/lib/meetings/meeting-response';

/**
 * Fetch the public-facing meeting detail projection (skips legal/internal
 * columns). Returns `null` if no row matches.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `requirePermission('meetings', 'read')`.
 */
export async function getMeetingDetail(
  communityId: number,
  meetingId: number,
): Promise<MeetingResponseRecord | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<MeetingResponseRecord>(
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
  return rows[0] ?? null;
}

export interface MeetingDocumentLink {
  [key: string]: unknown;
  documentId: number;
  attachedAt: Date;
}

/**
 * List the `(documentId, attachedAt)` link pairs for a meeting, ordered
 * by `attachedAt asc, documentId asc` so the response is deterministic.
 */
export async function listMeetingDocumentLinks(
  communityId: number,
  meetingId: number,
): Promise<MeetingDocumentLink[]> {
  const scoped = createScopedClient(communityId);
  return scoped
    .selectFrom<MeetingDocumentLink>(
      meetingDocuments,
      {
        documentId: meetingDocuments.documentId,
        attachedAt: meetingDocuments.attachedAt,
      },
      eq(meetingDocuments.meetingId, meetingId),
    )
    .orderBy(asc(meetingDocuments.attachedAt), asc(meetingDocuments.documentId));
}

export interface MeetingAttachedDocument {
  [key: string]: unknown;
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  categoryId: number | null;
}

/**
 * Bulk-fetch the documents linked to a meeting in the order returned by
 * `listMeetingDocumentLinks`. Empty input → empty array (no DB round-trip).
 */
export async function listMeetingAttachedDocuments(
  communityId: number,
  documentIds: number[],
): Promise<MeetingAttachedDocument[]> {
  if (documentIds.length === 0) return [];
  const scoped = createScopedClient(communityId);
  return scoped.selectFrom<MeetingAttachedDocument>(
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
}
