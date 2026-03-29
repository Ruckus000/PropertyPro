import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  documents,
  logAuditEvent,
  meetingDocuments,
  meetings,
} from '@propertypro/db';
import { and, asc, eq, gte, lt } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  parseCommunityIdFromBody as sharedParseCommunityIdFromBody,
  parseCommunityIdFromQuery,
} from '@/lib/finance/request';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseOptionalCalendarDateRange } from '@/lib/calendar/date-range';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  serializeMeetingResponse,
  type MeetingResponseRecord,
} from '@/lib/meetings/meeting-response';
import { createNotificationsForEvent, queueNotification } from '@/lib/services/notification-service';
import { resolveTimezone } from '@/lib/utils/timezone';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const meetingTypeSchema = z.enum([
  'board',
  'annual',
  'special',
  'budget',
  'committee',
]);

const isoDateTimeSchema = z.string().datetime({ offset: true });

const createMeetingSchema = z
  .object({
    communityId: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    meetingType: meetingTypeSchema,
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema.nullish(),
    location: z.string().trim().min(1).max(200),
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
});

const deleteMeetingSchema = z.object({
  action: z.literal('delete').optional(),
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
});

const attachDocSchema = z.object({
  action: z.literal('attach'),
  communityId: z.number().int().positive(),
  meetingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
});

const detachDocSchema = z.object({
  action: z.literal('detach'),
  communityId: z.number().int().positive(),
  meetingId: z.number().int().positive(),
  documentId: z.number().int().positive(),
});

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

async function findMeetingById(
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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'meetings', 'read');

  const { searchParams } = new URL(req.url);
  const range = parseOptionalCalendarDateRange(searchParams, membership.timezone);
  const scoped = createScopedClient(communityId);
  const whereClause = range
    ? and(
        gte(meetings.startsAt, range.startUtc),
        lt(meetings.startsAt, range.endUtcExclusive),
      )
    : undefined;

  const rows = await scoped
    .selectFrom<MeetingResponseRecord>(meetings, meetingColumns, whereClause)
    .orderBy(asc(meetings.startsAt), asc(meetings.id));

  return NextResponse.json({
    data: rows.map((meeting) => serializeMeetingResponse(meeting, membership.communityType)),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = (await req.json()) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : 'create';
  const communityId = parseCommunityIdFromBody(req, body);
  await assertNotDemoGrace(communityId);
  const normalizedBody = { ...body, communityId, action };

  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'meetings', 'write');
  await requireActiveSubscriptionForMutation(communityId);

  if (action === 'update') {
    return handleUpdate(normalizedBody, actorUserId, membership.communityType);
  }
  if (action === 'delete') {
    return handleDelete(normalizedBody, actorUserId);
  }
  if (action === 'attach') {
    return handleAttach(normalizedBody, actorUserId);
  }
  if (action === 'detach') {
    return handleDetach(normalizedBody, actorUserId);
  }

  return handleCreate(normalizedBody, actorUserId, membership.communityType);
});

async function handleCreate(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<NextResponse> {
  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid meeting data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, title, meetingType, startsAt, endsAt, location } = parsed.data;
  const scoped = createScopedClient(communityId);

  const [created] = await scoped.insert(meetings, {
    title,
    meetingType,
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    location,
  });

  const [createdMeeting, communityRows] = await Promise.all([
    findMeetingById(communityId, Number(created?.id)),
    scoped.selectFrom<{ timezone: string }>(
      communities,
      { timezone: communities.timezone },
      eq(communities.id, communityId),
    ),
  ]);
  if (!createdMeeting) {
    throw new Error('Created meeting could not be reloaded');
  }
  const communityTimezone = resolveTimezone(communityRows[0]?.timezone);

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
      actionUrl: `/meetings/${createdMeeting.id}`,
      sourceType: 'meeting',
      sourceId: String(createdMeeting.id),
    },
    'all',
    actorUserId,
  ).catch((err: unknown) => {
    console.error('[meetings] in-app notification failed', { communityId, meetingId: createdMeeting.id, error: err instanceof Error ? err.message : String(err) });
  });

  return NextResponse.json(
    { data: serializeMeetingResponse(createdMeeting, communityType) },
    { status: 201 },
  );
}

async function handleUpdate(
  body: Record<string, unknown>,
  actorUserId: string,
  communityType: Awaited<ReturnType<typeof requireCommunityMembership>>['communityType'],
): Promise<NextResponse> {
  const parsed = updateMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid update data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, communityId, title, meetingType, startsAt, endsAt, location } = parsed.data;
  const existing = await findMeetingById(communityId, id);
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

  if (Object.keys(updateData).length > 0) {
    const scoped = createScopedClient(communityId);
    await scoped.update(meetings, updateData, eq(meetings.id, id));
  }

  const updatedMeeting = await findMeetingById(communityId, id);
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

  return NextResponse.json({
    data: serializeMeetingResponse(updatedMeeting, communityType),
  });
}

async function handleDelete(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<NextResponse> {
  const parsed = deleteMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid delete data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { id, communityId } = parsed.data;
  const scoped = createScopedClient(communityId);
  await scoped.softDelete(meetings, eq(meetings.id, id));

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'meeting',
    resourceId: String(id),
    communityId,
  });

  return NextResponse.json({ data: { success: true } });
}

async function handleAttach(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<NextResponse> {
  const parsed = attachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid attachment data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, meetingId, documentId } = parsed.data;
  const scoped = createScopedClient(communityId);

  const [meetingRows, documentRows] = await Promise.all([
    scoped.selectFrom(meetings, { id: meetings.id }, eq(meetings.id, meetingId)),
    scoped.selectFrom(documents, { id: documents.id }, eq(documents.id, documentId)),
  ]);
  if (meetingRows.length === 0) {
    throw new NotFoundError('Meeting not found');
  }
  if (documentRows.length === 0) {
    throw new NotFoundError('Document not found');
  }

  const rows = await scoped.insert(meetingDocuments, {
    meetingId,
    documentId,
    attachedBy: actorUserId,
  });

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting_document',
    resourceId: String(rows[0]?.id ?? ''),
    communityId,
    newValues: { meetingId, documentId },
    metadata: { subAction: 'attach' },
  });

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

async function handleDetach(
  body: Record<string, unknown>,
  actorUserId: string,
): Promise<NextResponse> {
  const parsed = detachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid detach data', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, meetingId, documentId } = parsed.data;
  const scoped = createScopedClient(communityId);

  const [meetingRows, documentRows] = await Promise.all([
    scoped.selectFrom(meetings, { id: meetings.id }, eq(meetings.id, meetingId)),
    scoped.selectFrom(documents, { id: documents.id }, eq(documents.id, documentId)),
  ]);
  if (meetingRows.length === 0) {
    throw new NotFoundError('Meeting not found');
  }
  if (documentRows.length === 0) {
    throw new NotFoundError('Document not found');
  }

  await scoped.hardDelete(
    meetingDocuments,
    and(
      eq(meetingDocuments.meetingId, meetingId),
      eq(meetingDocuments.documentId, documentId),
    ),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting_document',
    resourceId: `${meetingId}:${documentId}`,
    communityId,
    metadata: { subAction: 'detach' },
  });

  return NextResponse.json({ data: { success: true } });
}
