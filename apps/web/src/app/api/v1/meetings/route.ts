/**
 * `/api/v1/meetings` — list (GET) and action-dispatch mutations (POST).
 *
 * CON-05 (Phase 3.5): both verbs go through `runRoute(contract, handler)`.
 * GET declares `tenantScope: { in: 'query' }` (runner-resolved communityId);
 * POST keeps parsing `communityId` out of the body itself, and emits its
 * notice-window `warnings` through the contract's declared envelope. See
 * `./contract.ts` for why, and for the exact GET error-path deltas.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEnvelope } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { BadRequestError, ConflictError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody as sharedParseCommunityIdFromBody } from '@/lib/finance/request';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseOptionalCalendarDateRange } from '@/lib/calendar/date-range';
import { requirePermission, requireBoardDesignation } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { serializeMeetingResponse } from '@/lib/meetings/meeting-response';
import { buildMeetingNoticeWarning } from '@/lib/meetings/notice-warning';
import { MEETING_AGENDA_MAX_LENGTH } from '@/lib/meetings/agenda';
import type { NoticeWarning } from '@/lib/compliance/notice-window';
import { createNotificationsForEvent, queueNotification } from '@/lib/services/notification-service';
import {
  attachMeetingDocument,
  createMeetingForCommunity,
  detachMeetingDocument,
  getMeetingCommunityTimezone,
  getMeetingDetail,
  getMeetingDocumentTargets,
  listMeetingsForCommunity,
  markMeetingNoticePosted,
  recordMeetingMinutes,
  softDeleteMeetingForCommunity,
  updateMeetingForCommunity,
} from '@/lib/services/meeting-service';
import { setDocumentReceivedAt } from '@/lib/services/document-received-at-service';
import { receivedAtSchema } from '@/lib/compliance/received-at';
import { resolveTimezone } from '@/lib/utils/timezone';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { meetingsActionContract, meetingsListContract } from './contract';

const meetingTypeSchema = z.enum([
  'board',
  'annual',
  'special',
  'budget',
  'committee',
]);

const isoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * The plain-text agenda posted with the notice (§718.111(12)(g)2.m–n,
 * §720.303(4)(b)1.l–m). Line breaks are kept — an agenda is a list — and only
 * the ends are trimmed. Blank becomes null, so clearing the field removes the
 * agenda rather than storing whitespace.
 */
const agendaSchema = z
  .string()
  .max(MEETING_AGENDA_MAX_LENGTH)
  .nullish()
  .transform((value) => {
    if (value === undefined) return undefined;
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  });

const createMeetingSchema = z
  .object({
    communityId: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    meetingType: meetingTypeSchema,
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema.nullish(),
    location: z.string().trim().min(1).max(200),
    agenda: agendaSchema,
    agendaPublished: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'End time must be after start time',
      });
    }
  });

const updateMeetingSchema = z.object({
  action: z.literal('update').optional(),
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  meetingType: meetingTypeSchema.optional(),
  startsAt: isoDateTimeSchema.optional(),
  endsAt: isoDateTimeSchema.nullish().optional(),
  location: z.string().trim().min(1).max(200).optional(),
  agenda: agendaSchema,
  agendaPublished: z.boolean().optional(),
});

const deleteMeetingSchema = z.object({
  action: z.literal('delete').optional(),
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
});

const postNoticeSchema = z.object({
  action: z.literal('post-notice'),
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
});

const attachDocSchema = z.object({
  action: z.literal('attach'),
  communityId: z.number().int().positive(),
  meetingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
});

const recordMinutesSchema = z.object({
  action: z.literal('record-minutes'),
  communityId: z.number().int().positive(),
  meetingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  /** When the board approved the minutes: the document's received/created date (H-2). */
  approvedAt: receivedAtSchema.optional(),
});

const detachDocSchema = z.object({
  action: z.literal('detach'),
  communityId: z.number().int().positive(),
  meetingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
});

function parseCommunityIdFromBody(
  req: NextRequest,
  body: Record<string, unknown>,
): number {
  const raw = body.communityId;
  const communityId = typeof raw === 'number' ? raw : Number(raw);
  return sharedParseCommunityIdFromBody(req, communityId);
}

function assertMeetingWindow(startsAt: string, endsAt?: string | null): void {
  if (!endsAt) {
    return;
  }

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new UnprocessableEntityError('Invalid meeting data', {
      fields: { endsAt: ['End time must be after start time'] },
    });
  }
}

/**
 * The `?communityId=` checks the legacy `parseCommunityIdFromQuery` made after
 * auth, with its `BadRequestError` messages. The runner has already resolved
 * `communityId` (tenantScope: query), and the contract maps a missing or junk
 * query value to `undefined`, so a request reaches the handler with one only
 * when `x-community-id` supplied the tenant — the query param has always been
 * required, so keep refusing it exactly as before. When the param IS a positive
 * integer the resolver has already matched it against the header, so the
 * injected `communityId` equals it.
 */
function assertCommunityIdQueryParam(req: NextRequest): void {
  const raw = new URL(req.url).searchParams.get('communityId');
  if (!raw) {
    throw new BadRequestError('communityId query parameter is required');
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }
}

export const GET = withErrorHandler(
  runRoute(meetingsListContract, async ({ req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    assertCommunityIdQueryParam(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'meetings', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const range = parseOptionalCalendarDateRange(searchParams, membership.timezone);
    const rows = await listMeetingsForCommunity(communityId, range ?? undefined);

    return rows.map((meeting) => serializeMeetingResponse(meeting, membership.communityType));
  }),
);

export const POST = withErrorHandler(
  runRoute(meetingsActionContract, async ({ body: rawBody, req }) => {
    // A malformed JSON body arrives as `undefined` (the runner swallows the parse
    // error), so reading `action` below throws → 500, exactly as the legacy
    // `await req.json()` did. Pinned by route-contract.test.ts.
    const body = rawBody as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';
    const communityId = parseCommunityIdFromBody(req, body);
    const normalizedBody = { ...body, communityId, action };

    // What moved: `assertNotDemoGrace` now runs AFTER authentication. The body
    // parse and `parseCommunityIdFromBody` above still precede it, and that is
    // fine — they are pure parsing plus a header cross-check, with no DB read and
    // so no oracle. The documented chain
    // (`requireAuthenticatedUserId -> resolve -> assertNotDemoGrace -> membership`,
    // `.claude/rules/api-patterns.md`) is about where the GUARDS sit, not where
    // the id is parsed; stating it as the literal statement order here would
    // overclaim, which is the defect `guard:legacy-roles` pass 2 exists to catch.
    //
    // This route used to run assertNotDemoGrace FIRST, ahead of authentication.
    // That guard does an UNSCOPED primary-key SELECT on `communities` for whatever
    // id the caller put in the body, and `resolveEffectiveCommunityId` only
    // cross-checks the body against `x-community-id` when middleware actually
    // stamped that header — which it does from tenant context or a
    // `/communities/[id]/` path, not for an apex-host POST. So the read ran, and
    // its outcome was distinguishable (403 demo-grace vs. falling through),
    // before the handler had established anything about the caller.
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'meetings', 'write');
    // Statutory board-meeting *calls* require a board designation (role-v3 §3.2):
    // gate creating — or updating a meeting to — meetingType 'board'. Delete /
    // attach / detach are general `meetings:write` powers (general permissions come
    // from the role, never the designation) and are intentionally NOT gated here.
    // No bypass: requirePermission(meetings,'write') above already limits ALL of
    // these actions to management-tier callers, every one of whom is `isAdmin` (no
    // resident role holds meetings:write — see RBAC matrix), so they pass this gate
    // regardless. It is therefore behaviour-neutral today; the designation arm only
    // becomes load-bearing once a resident can hold a board seat, which a later
    // Phase-3 sub-project will enforce holistically across the meeting actions.
    if (body.meetingType === 'board') {
      requireBoardDesignation(membership);
    }
    await requireActiveSubscriptionForMutation(communityId);

    if (action === 'update') {
      return handleUpdate(normalizedBody, actorUserId, membership.communityType);
    }
    if (action === 'delete') {
      return handleDelete(normalizedBody, actorUserId);
    }
    if (action === 'post-notice') {
      return handlePostNotice(normalizedBody, actorUserId, membership.communityType);
    }
    if (action === 'attach') {
      return handleAttach(normalizedBody, actorUserId);
    }
    if (action === 'detach') {
      return handleDetach(normalizedBody, actorUserId);
    }
    if (action === 'record-minutes') {
      return handleRecordMinutes(normalizedBody, actorUserId, membership.communityType);
    }

    return handleCreate(normalizedBody, actorUserId, membership.communityType);
  }),
);

/**
 * `{ data: <meeting> }`, plus a top-level `warnings` sibling when the schedule
 * is already inside its notice window.
 *
 * The envelope matches the documents route (`{ data, warnings?: [...] }`),
 * which is the app's only existing warnings precedent — #932's issue text cites
 * announcements, but announcements has none. The sibling goes out through the
 * contract's declared `envelope` (CON-04); `undefined` is omitted from the
 * wire, so the shape for a compliant meeting is a bare `{ data }`, as it
 * always was.
 *
 * Only mutations warn. A read does not, deliberately: every meeting whose
 * notice window has since closed would flag on every list request forever, and
 * there is nothing a board can do about a meeting that already happened. The
 * detail modal already shows the deadline itself with an escalation badge.
 */
function meetingResponse(
  meeting: Parameters<typeof serializeMeetingResponse>[0],
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
) {
  const data = serializeMeetingResponse(meeting, communityType);
  const warning = buildMeetingNoticeWarning({
    startsAt: meeting.startsAt,
    meetingType: meeting.meetingType as Parameters<typeof buildMeetingNoticeWarning>[0]['meetingType'],
    communityType,
    now: new Date(),
  });

  const warnings: NoticeWarning[] = warning ? [warning] : [];
  return withEnvelope(data, { warnings: warnings.length > 0 ? warnings : undefined });
}

async function handleCreate(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<unknown> {
  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid meeting data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, title, meetingType, startsAt, endsAt, location } = parsed.data;
  const agenda = parsed.data.agenda ?? null;
  // Default on: the statute posts the agenda with the notice.
  const agendaPublished = parsed.data.agendaPublished ?? true;
  const createdMeetingId = await createMeetingForCommunity(communityId, {
    title,
    meetingType,
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    location,
    agenda,
    agendaPublished,
  });

  const [createdMeeting, rawCommunityTimezone] = await Promise.all([
    createdMeetingId ? getMeetingDetail(communityId, createdMeetingId) : null,
    getMeetingCommunityTimezone(communityId),
  ]);
  if (!createdMeeting) {
    throw new Error('Created meeting could not be reloaded');
  }
  const communityTimezone = resolveTimezone(rawCommunityTimezone);

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'meeting',
    resourceId: String(createdMeeting.id),
    communityId,
    newValues: {
      title,
      meetingType,
      startsAt,
      endsAt: endsAt ?? null,
      location,
      agenda,
      agendaPublished,
    },
  });

  const startsAtDate = new Date(startsAt);
  const emailMeetingType = meetingType === 'board' || meetingType === 'committee'
    ? 'board' as const
    : meetingType === 'special'
      ? 'special' as const
      : 'owner' as const;

  try {
    await queueNotification(
      communityId,
      {
        type: 'meeting_notice',
        meetingTitle: title,
        meetingDate: startsAtDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: communityTimezone,
        }),
        meetingTime: startsAtDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
          timeZone: communityTimezone,
        }),
        location,
        meetingType: emailMeetingType,
        sourceType: 'meeting',
        sourceId: String(createdMeeting.id),
      },
      'all',
      actorUserId,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[meetings] notification dispatch failed', {
      communityId,
      meetingId: createdMeeting.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  void createNotificationsForEvent(
    communityId,
    {
      category: 'meeting',
      title: `New Meeting: ${title}`,
      body: `${startsAtDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: communityTimezone })} · ${location}`,
      actionUrl: `/meetings/${createdMeeting.id}?communityId=${communityId}`,
      sourceType: 'meeting',
      sourceId: String(createdMeeting.id),
    },
    'all',
    actorUserId,
  ).catch((err: unknown) => {
    console.error('[meetings] in-app notification failed', { communityId, meetingId: createdMeeting.id, error: err instanceof Error ? err.message : String(err) });
  });

  return meetingResponse(createdMeeting, communityType);
}

async function handleUpdate(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<unknown> {
  const parsed = updateMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid update data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, communityId, title, meetingType, startsAt, endsAt, location, agenda, agendaPublished } = parsed.data;
  const existing = await getMeetingDetail(communityId, id);
  if (!existing) {
    throw new NotFoundError('Meeting not found');
  }

  const nextStartsAt = startsAt ?? existing.startsAt.toISOString();
  const nextEndsAt = endsAt === undefined
    ? existing.endsAt?.toISOString() ?? null
    : endsAt;
  assertMeetingWindow(nextStartsAt, nextEndsAt);

  const updateData: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  if (title !== undefined) {
    updateData.title = title;
    oldValues.title = existing.title;
    newValues.title = title;
  }
  if (meetingType !== undefined) {
    updateData.meetingType = meetingType;
    oldValues.meetingType = existing.meetingType;
    newValues.meetingType = meetingType;
  }
  if (startsAt !== undefined) {
    updateData.startsAt = new Date(startsAt);
    oldValues.startsAt = existing.startsAt.toISOString();
    newValues.startsAt = startsAt;
  }
  if (endsAt !== undefined) {
    updateData.endsAt = endsAt ? new Date(endsAt) : null;
    oldValues.endsAt = existing.endsAt?.toISOString() ?? null;
    newValues.endsAt = endsAt;
  }
  if (location !== undefined) {
    updateData.location = location;
    oldValues.location = existing.location;
    newValues.location = location;
  }
  if (agenda !== undefined) {
    updateData.agenda = agenda;
    oldValues.agenda = existing.agenda ?? null;
    newValues.agenda = agenda;
  }
  if (agendaPublished !== undefined) {
    updateData.agendaPublished = agendaPublished;
    oldValues.agendaPublished = existing.agendaPublished;
    newValues.agendaPublished = agendaPublished;
  }

  if (Object.keys(updateData).length > 0) {
    await updateMeetingForCommunity(communityId, id, updateData);
  }

  const updatedMeeting = await getMeetingDetail(communityId, id);
  if (!updatedMeeting) {
    throw new NotFoundError('Meeting not found');
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting',
    resourceId: String(id),
    communityId,
    oldValues,
    newValues,
  });

  return meetingResponse(updatedMeeting, communityType);
}

/**
 * Record that this meeting's statutory notice is posted.
 *
 * The stamp is an attestation by a manager, not something the platform
 * observed — §718.112(2)(c) notice goes on the property as well as the
 * website. The UI's confirmation copy says so; this handler only writes it.
 *
 * Deliberately NOT wrapped in `meetingResponse()`. That helper appends the
 * notice-window warning, whose advice is "reschedule with a compliant
 * notice" — stale the instant a notice is posted, and actively misleading
 * next to a fresh stamp. A late posting is still recorded: the public
 * transparency page derives the achieved lead time and reports the miss.
 */
async function handlePostNotice(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<unknown> {
  const parsed = postNoticeSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid notice data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, communityId } = parsed.data;
  const result = await markMeetingNoticePosted(communityId, id, new Date());
  if (!result.found) {
    throw new NotFoundError('Meeting not found');
  }

  // Audited from the value just written, before the read-back below: a
  // failing read must not be able to leave a stamped row with no audit entry.
  if (!result.alreadyStamped && result.stampedAt) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'meeting_notice_posted',
      resourceType: 'meeting',
      resourceId: String(id),
      communityId,
      newValues: { noticePostedAt: result.stampedAt.toISOString() },
    });
  }

  const meeting = await getMeetingDetail(communityId, id);
  if (!meeting) {
    throw new NotFoundError('Meeting not found');
  }

  return serializeMeetingResponse(meeting, communityType);
}

async function handleDelete(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<unknown> {
  const parsed = deleteMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid delete data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, communityId } = parsed.data;
  await softDeleteMeetingForCommunity(communityId, id);

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'meeting',
    resourceId: String(id),
    communityId,
  });

  return { success: true };
}

async function handleAttach(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<unknown> {
  const parsed = attachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid attachment data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, meetingId, documentId } = parsed.data;
  const targets = await getMeetingDocumentTargets(communityId, meetingId, documentId);
  if (!targets.meetingFound) {
    throw new NotFoundError('Meeting not found');
  }
  if (!targets.documentFound) {
    throw new NotFoundError('Document not found');
  }

  const attachment = await attachMeetingDocument(communityId, meetingId, documentId, actorUserId);

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting_document',
    resourceId: String(attachment?.id ?? ''),
    communityId,
    newValues: { meetingId, documentId },
    metadata: { subAction: 'attach' },
  });

  return attachment;
}

/**
 * Record an uploaded, posted document as a held meeting's minutes (H-5), so
 * the per-meeting minutes score can count minutes a board uploads as a file,
 * not only minutes written in the app. `approvedAt`, when given, is written to
 * the document as its received/created date: the minutes' 30-day clock runs
 * from their approval.
 */
async function handleRecordMinutes(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<unknown> {
  const parsed = recordMinutesSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid minutes data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, meetingId, documentId, approvedAt } = parsed.data;
  const result = await recordMeetingMinutes(communityId, meetingId, documentId, actorUserId);
  switch (result.outcome) {
    case 'meeting_not_found':
      throw new NotFoundError('Meeting not found');
    case 'document_not_found':
      throw new NotFoundError('Document not found');
    case 'meeting_not_held':
      throw new UnprocessableEntityError('Minutes can be recorded once the meeting has been held', {
        fields: { meetingId: ['This meeting has not been held yet'] },
      });
    case 'has_other_minutes':
      throw new ConflictError('This meeting already has a different minutes document.');
    case 'recorded':
      break;
  }

  if (result.attached) {
    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'meeting_document',
      resourceId: `${meetingId}:${documentId}`,
      communityId,
      newValues: { meetingId, documentId },
      metadata: { subAction: 'attach', via: 'record_minutes' },
    });
  }
  await logAuditEvent({
    userId: actorUserId,
    action: 'meeting_minutes_approved',
    resourceType: 'meeting',
    resourceId: String(meetingId),
    communityId,
    newValues: {
      minutesDocumentId: documentId,
      ...(result.alreadyStamped ? {} : { minutesApprovedAt: result.stampedAt.toISOString() }),
    },
    metadata: { via: 'record_minutes' },
  });

  if (approvedAt) {
    const approvedDate = new Date(approvedAt);
    const written = await setDocumentReceivedAt(communityId, documentId, approvedDate);
    if (written) {
      await logAuditEvent({
        userId: actorUserId,
        action: 'update',
        resourceType: 'document',
        resourceId: String(documentId),
        communityId,
        oldValues: { receivedAt: written.previous?.toISOString() ?? null },
        newValues: { receivedAt: approvedDate.toISOString() },
        metadata: { via: 'record_minutes', meetingId },
      });
    }
  }

  const meeting = await getMeetingDetail(communityId, meetingId);
  if (!meeting) {
    throw new NotFoundError('Meeting not found');
  }
  return serializeMeetingResponse(meeting, communityType);
}

async function handleDetach(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<unknown> {
  const parsed = detachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid detach data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, meetingId, documentId } = parsed.data;
  const targets = await getMeetingDocumentTargets(communityId, meetingId, documentId);
  if (!targets.meetingFound) {
    throw new NotFoundError('Meeting not found');
  }
  if (!targets.documentFound) {
    throw new NotFoundError('Document not found');
  }

  await detachMeetingDocument(communityId, meetingId, documentId);

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting_document',
    resourceId: `${meetingId}:${documentId}`,
    communityId,
    metadata: { subAction: 'detach' },
  });

  return { success: true };
}
