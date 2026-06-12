import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
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
import { requirePermission, requireBoardDesignation } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { serializeMeetingResponse } from '@/lib/meetings/meeting-response';
import { createNotificationsForEvent, queueNotification } from '@/lib/services/notification-service';
import {
  attachMeetingDocument,
  createMeetingForCommunity,
  detachMeetingDocument,
  getMeetingCommunityTimezone,
  getMeetingDetail,
  getMeetingDocumentTargets,
  listMeetingsForCommunity,
  softDeleteMeetingForCommunity,
  updateMeetingForCommunity,
} from '@/lib/services/meeting-service';
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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'meetings', 'read');

  const { searchParams } = new URL(req.url);
  const range = parseOptionalCalendarDateRange(searchParams, membership.timezone);
  const rows = await listMeetingsForCommunity(communityId, range ?? undefined);

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
  const createdMeetingId = await createMeetingForCommunity(communityId, {
    title,
    meetingType,
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    location,
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
    { data: serializeMeetingResponse(createdMeeting, communityType) }
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
  await softDeleteMeetingForCommunity(communityId, id);

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

  return NextResponse.json({ data: attachment });
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

  return NextResponse.json({ data: { success: true } });
}
