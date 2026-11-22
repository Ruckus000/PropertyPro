/**
 * Meeting Service
 *
 * Tenant-scoped lookups for the `meetings` table and its companions
 * (`meeting_documents`, the join into `documents`). First helpers added by
 * A3 drain #50 for the meetings detail route; A3 drain #73 extended this
 * file to cover the collection route's list/create/update/delete and
 * document attachment flows.
 */
import {
  buildDocumentAccessFilter,
  communities,
  createScopedClient,
  documents,
  meetingDocuments,
  meetings,
  type DocumentAccessContext,
} from '@propertypro/db';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt } from '@propertypro/db/filters';
import type { MeetingResponseRecord } from '@/lib/meetings/meeting-response';
import type { ComplianceScoringMeeting } from '@/lib/compliance/meeting-minutes-status';

const meetingColumns = {
  id: meetings.id,
  title: meetings.title,
  meetingType: meetings.meetingType,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  location: meetings.location,
  agenda: meetings.agenda,
  agendaPublished: meetings.agendaPublished,
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
  /** Plain text; null when no agenda was entered. */
  agenda: string | null;
  /** Show the agenda on the public website. Omitted: the column default (true). */
  agendaPublished?: boolean;
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
 * The meetings that score the meeting-notice and minutes checklist rows: every
 * live meeting starting on or after `since`, upcoming ones included (a notice
 * can fall due before its meeting starts).
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership; the compliance loaders gate on `compliance:read`.
 */
export async function listMeetingsForComplianceScoring(
  communityId: number,
  since: Date,
): Promise<ComplianceScoringMeeting[]> {
  const scoped = createScopedClient(communityId);
  return scoped
    .selectFrom<ComplianceScoringMeeting & { [key: string]: unknown }>(
      meetings,
      {
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        startsAt: meetings.startsAt,
        noticePostedAt: meetings.noticePostedAt,
        minutesApprovedAt: meetings.minutesApprovedAt,
        minutesDocumentId: meetings.minutesDocumentId,
      },
      gte(meetings.startsAt, since),
    )
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
 * Name the document that is a meeting's minutes, once. A meeting's minutes are
 * one document; first write wins, as with the stamps above, so a later call
 * cannot swap the record a deadline was judged against. Returns whether this
 * call named it.
 *
 * AUTHZ: caller MUST have verified the document is a posted document in this
 * community and `requirePermission('meetings', 'write')` (or the documents
 * publish path).
 */
export async function setMeetingMinutesDocument(
  communityId: number,
  meetingId: number,
  documentId: number,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const updated = (await scoped.update(
    meetings,
    { minutesDocumentId: documentId },
    and(eq(meetings.id, meetingId), isNull(meetings.minutesDocumentId)),
  )) as unknown as Array<unknown> | undefined;
  return (updated?.length ?? 0) > 0;
}

export type RecordMeetingMinutesResult =
  | { outcome: 'meeting_not_found' }
  | { outcome: 'document_not_found' }
  | { outcome: 'meeting_not_held' }
  | { outcome: 'has_other_minutes' }
  | { outcome: 'recorded'; stampedAt: Date; alreadyStamped: boolean; attached: boolean };

/**
 * Record an uploaded, posted document as a held meeting's minutes: attach it
 * to the meeting (unless it already is), name it as the minutes, and stamp
 * `minutes_approved_at` — the posting stamp — with the document's own
 * `posted_at`, the moment owners could first open it. A stamp already present
 * is kept (first write wins).
 *
 * The authored-minutes publish path does the same for minutes written in the
 * app; this is the path for minutes uploaded as a file (audit 2026-11-05, H-5).
 *
 * AUTHZ: caller MUST have verified `requirePermission('meetings', 'write')`.
 * Both rows are read through the scoped client, so a document or meeting in
 * another community is "not found".
 */
export async function recordMeetingMinutes(
  communityId: number,
  meetingId: number,
  documentId: number,
  actorUserId: string,
  now: Date = new Date(),
): Promise<RecordMeetingMinutesResult> {
  const scoped = createScopedClient(communityId);
  const [meetingRows, documentRows, attachmentRows] = await Promise.all([
    scoped.selectFrom<Record<string, unknown>>(
      meetings,
      {
        id: meetings.id,
        startsAt: meetings.startsAt,
        minutesApprovedAt: meetings.minutesApprovedAt,
        minutesDocumentId: meetings.minutesDocumentId,
      },
      eq(meetings.id, meetingId),
    ),
    // A draft is not posted, so it cannot be posted minutes.
    scoped.selectFrom<Record<string, unknown>>(
      documents,
      { id: documents.id, postedAt: documents.postedAt },
      and(eq(documents.id, documentId), isNotNull(documents.postedAt)),
    ),
    scoped.selectFrom<Record<string, unknown>>(
      meetingDocuments,
      { id: meetingDocuments.id },
      and(eq(meetingDocuments.meetingId, meetingId), eq(meetingDocuments.documentId, documentId)),
    ),
  ]);

  const meeting = meetingRows[0];
  if (!meeting) return { outcome: 'meeting_not_found' };
  const document = documentRows[0];
  if (!document) return { outcome: 'document_not_found' };
  if (new Date(meeting['startsAt'] as string | Date).getTime() > now.getTime()) {
    return { outcome: 'meeting_not_held' };
  }
  const currentDocumentId = meeting['minutesDocumentId'] as number | null;
  if (currentDocumentId != null && Number(currentDocumentId) !== documentId) {
    return { outcome: 'has_other_minutes' };
  }

  // Name the minutes BEFORE attaching or stamping, and trust the guarded
  // write over the read above: two concurrent calls with different documents
  // both pass the read, and only one may win.
  if (currentDocumentId == null) {
    const named = await setMeetingMinutesDocument(communityId, meetingId, documentId);
    if (!named) {
      const [after] = await scoped.selectFrom<Record<string, unknown>>(
        meetings,
        { id: meetings.id, minutesDocumentId: meetings.minutesDocumentId },
        eq(meetings.id, meetingId),
      );
      if (!after) return { outcome: 'meeting_not_found' };
      if (Number(after['minutesDocumentId']) !== documentId) return { outcome: 'has_other_minutes' };
    }
  }

  const attached = attachmentRows.length === 0;
  if (attached) {
    await scoped.insert(meetingDocuments, { meetingId, documentId, attachedBy: actorUserId });
  }
  const postedAt = new Date(document['postedAt'] as string | Date);
  const stamp = await stampMeetingColumn(communityId, meetingId, 'minutesApprovedAt', postedAt);
  return {
    outcome: 'recorded',
    stampedAt: stamp.stampedAt ?? postedAt,
    alreadyStamped: stamp.alreadyStamped,
    attached,
  };
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
    // A draft cannot be attached: the meeting is visible to residents, and the
    // draft is not. Reported as not found, like a document in another community.
    scoped.selectFrom(
      documents,
      { id: documents.id },
      and(eq(documents.id, documentId), isNotNull(documents.postedAt)),
    ),
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
 *
 * Filtered to the categories `access` may read, by the same policy as the
 * documents library (`buildDocumentAccessFilter`). Without it a meeting
 * listed the title of every attached document — e.g. an Inspection Report to
 * a condo tenant whose community has not opted in — even though downloading
 * it was refused. Managers and unit owners get no category filter.
 */
export async function listMeetingAttachedDocuments(
  access: DocumentAccessContext,
  documentIds: number[],
): Promise<MeetingAttachedDocument[]> {
  if (documentIds.length === 0) return [];
  const accessFilter = await buildDocumentAccessFilter(access);
  const scoped = createScopedClient(access.communityId);
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
    // A document taken back to a draft after it was attached stays linked
    // but is not shown — residents read this list.
    and(inArray(documents.id, documentIds), isNotNull(documents.postedAt), accessFilter),
  );
}
