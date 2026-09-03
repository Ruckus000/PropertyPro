/**
 * Meeting Service
 *
 * Tenant-scoped lookups for the `meetings` table and its companions
 * (`meeting_documents`, the join into `documents`). First helpers added by
 * A3 drain #50 for the meetings detail route; A3 drain #73 extended this
 * file to cover the collection route's list/create/update/delete and
 * document attachment flows.
 */
import { communities, createScopedClient, documents, meetingDocuments, meetings } from '@propertypro/db';
import { and, asc, eq, gte, inArray, lt } from '@propertypro/db/filters';
import type { MeetingResponseRecord } from '@/lib/meetings/meeting-response';

const meetingColumns = {
  id: meetings.id,
  title: meetings.title,
  meetingType: meetings.meetingType,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  location: meetings.location,
  noticePostedAt: meetings.noticePostedAt,
  minutesApprovedAt: meetings.minutesApprovedAt,
} as const;

export interface MeetingDateRange {
  startUtc: Date;
  endUtcExclusive: Date;
}

export interface CreateMeetingInput {
  [key: string]: unknown;
  title: string;
  meetingType: 'board' | 'annual' | 'special' | 'budget' | 'committee';
  startsAt: Date;
  endsAt: Date | null;
  location: string;
}

/**
 * List the public-facing meeting projection for a community. Optional date
 * range filters are pushed into SQL so calendar views do not load unrelated
 * meetings and filter them in the route.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `requirePermission('meetings', 'read')`.
 */
export async function listMeetingsForCommunity(
  communityId: number,
  range?: MeetingDateRange,
): Promise<MeetingResponseRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereClause = range
    ? and(
        gte(meetings.startsAt, range.startUtc),
        lt(meetings.startsAt, range.endUtcExclusive),
      )
    : undefined;

  return scoped
    .selectFrom<MeetingResponseRecord>(meetings, meetingColumns, whereClause)
    .orderBy(asc(meetings.startsAt), asc(meetings.id));
}

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
    meetingColumns,
    eq(meetings.id, meetingId),
  );
  return rows[0] ?? null;
}

/**
 * Create a meeting and return the inserted row id.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`
 * and the active-subscription mutation gate before invoking.
 */
export async function createMeetingForCommunity(
  communityId: number,
  input: CreateMeetingInput,
): Promise<number | null> {
  const scoped = createScopedClient(communityId);
  const [created] = await scoped.insert(meetings, input);
  return Number(created?.id ?? NaN) || null;
}

/**
 * Fetch the community timezone used to localize meeting notification copy.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified community
 * membership for this community.
 */
export async function getMeetingCommunityTimezone(communityId: number): Promise<string | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ timezone: string }>(
    communities,
    { timezone: communities.timezone },
    eq(communities.id, communityId),
  );
  return rows[0]?.timezone ?? null;
}

/**
 * Update a meeting by id. The route owns validation and audit diffing; this
 * helper owns the tenant-scoped table mutation.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`.
 */
export async function updateMeetingForCommunity(
  communityId: number,
  meetingId: number,
  values: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(meetings, values, eq(meetings.id, meetingId));
}

/**
 * The outcome of stamping one of the two statutory record columns.
 *
 * `found: false` is a 404 for the caller. `alreadyStamped` distinguishes "we
 * wrote the stamp just now" from "a stamp was already there", which the
 * callers need in order to log exactly one audit event per real posting.
 */
export interface MeetingStampResult {
  found: boolean;
  stampedAt: Date | null;
  alreadyStamped: boolean;
}

/**
 * Stamp one statutory record column, once.
 *
 * Both columns record WHEN a thing was put on the record, so a second write
 * would move a date the association may already have relied on, and would
 * claim a second posting that never happened. First write wins; later calls
 * report the original value and change nothing.
 */
async function stampMeetingColumn(
  communityId: number,
  meetingId: number,
  column: 'noticePostedAt' | 'minutesApprovedAt',
  stampedAt: Date,
): Promise<MeetingStampResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<Record<string, unknown>>(
    meetings,
    { id: meetings.id, [column]: meetings[column] },
    eq(meetings.id, meetingId),
  );

  const existing = rows[0];
  if (!existing) {
    return { found: false, stampedAt: null, alreadyStamped: false };
  }

  const current = existing[column];
  if (current instanceof Date) {
    return { found: true, stampedAt: current, alreadyStamped: true };
  }

  await scoped.update(meetings, { [column]: stampedAt }, eq(meetings.id, meetingId));
  return { found: true, stampedAt, alreadyStamped: false };
}

/**
 * Record that a meeting's statutory notice is posted.
 *
 * This is an ATTESTATION, not an observation. §718.112(2)(c) notice goes on
 * the property AND the website, and the platform can only witness the second,
 * so what the column records is that a manager stated the notice is posted.
 * The public transparency page then derives the achieved lead time from this
 * stamp — including, honestly, a lead time that missed the requirement.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`.
 */
export async function markMeetingNoticePosted(
  communityId: number,
  meetingId: number,
  postedAt: Date,
): Promise<MeetingStampResult> {
  return stampMeetingColumn(communityId, meetingId, 'noticePostedAt', postedAt);
}

/**
 * Record that a meeting's minutes are on the record.
 *
 * Called from the document-draft publish path: publishing minutes authored
 * from a meeting IS the posting event that §718.111(12)(g)'s 30-day window
 * measures. Before this existed the loop was open — authoring minutes created
 * the document and linked it to the meeting, but the meeting itself still read
 * "minutes owed" forever, on the meetings screen and in the snowbird digest.
 *
 * AUTHZ: caller MUST have verified `requirePermission('documents', 'write')`
 * (the publish path) or `requirePermission('meetings', 'write')`.
 */
export async function markMeetingMinutesPosted(
  communityId: number,
  meetingId: number,
  postedAt: Date,
): Promise<MeetingStampResult> {
  return stampMeetingColumn(communityId, meetingId, 'minutesApprovedAt', postedAt);
}

/**
 * Soft-delete a meeting by id.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`.
 */
export async function softDeleteMeetingForCommunity(
  communityId: number,
  meetingId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.softDelete(meetings, eq(meetings.id, meetingId));
}

export interface MeetingDocumentAttachment {
  id: number;
  meetingId: number;
  documentId: number;
  attachedBy: string;
}

export interface MeetingDocumentTargets {
  meetingFound: boolean;
  documentFound: boolean;
}

/**
 * Check that both sides of a meeting-document attachment exist in the scoped
 * community before attaching or detaching the link.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`.
 */
export async function getMeetingDocumentTargets(
  communityId: number,
  meetingId: number,
  documentId: number,
): Promise<MeetingDocumentTargets> {
  const scoped = createScopedClient(communityId);
  const [meetingRows, documentRows] = await Promise.all([
    scoped.selectFrom(meetings, { id: meetings.id }, eq(meetings.id, meetingId)),
    scoped.selectFrom(documents, { id: documents.id }, eq(documents.id, documentId)),
  ]);
  return {
    meetingFound: meetingRows.length > 0,
    documentFound: documentRows.length > 0,
  };
}

/**
 * Attach a document to a meeting and return the inserted join row.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`
 * and validated both target rows exist.
 */
export async function attachMeetingDocument(
  communityId: number,
  meetingId: number,
  documentId: number,
  actorUserId: string,
): Promise<MeetingDocumentAttachment | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(meetingDocuments, {
    meetingId,
    documentId,
    attachedBy: actorUserId,
  });
  return (rows[0] as MeetingDocumentAttachment | undefined) ?? null;
}

/**
 * Hard-delete a meeting-document join row.
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`
 * and validated both target rows exist.
 */
export async function detachMeetingDocument(
  communityId: number,
  meetingId: number,
  documentId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.hardDelete(
    meetingDocuments,
    and(
      eq(meetingDocuments.meetingId, meetingId),
      eq(meetingDocuments.documentId, documentId),
    ),
  );
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
