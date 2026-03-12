/**
 * Meetings API — CRUD operations + document attachments.
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation
 * - logAuditEvent on every mutation
 * - Zod validation
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  logAuditEvent,
  communities,
  documents,
  meetings,
  meetingDocuments,
  type Meeting,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError, UnprocessableEntityError, NotFoundError, ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  calculateMinutesPostingDeadline,
  calculateNoticePostBy,
  calculateOwnerVoteDocsDeadline,
  type MeetingType,
} from '@/lib/utils/meeting-calculator';
import { queueNotification } from '@/lib/services/notification-service';
import { resolveTimezone } from '@/lib/utils/timezone';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requirePermission } from '@/lib/db/access-control';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const meetingTypeSchema = z.enum([
  'board',
  'annual',
  'special',
  'budget',
  'committee',
]) as z.ZodType<MeetingType>;

const isoDateString = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid ISO date string');

const createMeetingSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1),
  meetingType: meetingTypeSchema,
  startsAt: isoDateString,
  location: z.string().min(1),
});

const updateMeetingSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  title: z.string().min(1).optional(),
  meetingType: meetingTypeSchema.optional(),
  startsAt: isoDateString.optional(),
  location: z.string().min(1).optional(),
});

const deleteMeetingSchema = z.object({
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireMeetingsEnabled(communityType: CommunityType): void {
  if (communityType === 'apartment') {
    throw new ForbiddenError('Meeting management is only available for condo and HOA communities');
  }
}

function coerceMeeting(row: Record<string, unknown>): Meeting {
  // coerceMeeting is a typed cast workaround because createScopedClient returns
  // generic Record<string,unknown> rows. Once the scoped client is updated to
  // return typed rows this cast can be removed.
  return row as unknown as Meeting;
}

// ---------------------------------------------------------------------------
// GET — List meetings for a community (computed deadlines included)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new BadRequestError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }
  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireMeetingsEnabled(membership.communityType);
  requirePermission(membership, 'meetings', 'read');

  const scoped = createScopedClient(communityId);

  const rows = await scoped.query(meetings);
  const data = rows
    .map(coerceMeeting)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((m) => {
      const startsAt = new Date(m.startsAt);
      return {
        ...m,
        deadlines: {
          noticePostBy: calculateNoticePostBy(
            startsAt,
            m.meetingType as MeetingType,
            membership.communityType,
          ),
          ownerVoteDocsBy: calculateOwnerVoteDocsDeadline(startsAt),
          minutesPostBy: calculateMinutesPostingDeadline(startsAt),
        },
      };
    });

  return NextResponse.json({ data });
});

// ---------------------------------------------------------------------------
// POST — create, update, delete, attach, detach
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = (await req.json()) as Record<string, unknown>;
  const action = (body['action'] as string | undefined) ?? 'create';
  const rawCommunityId = body['communityId'];
  const parsedCommunityId = typeof rawCommunityId === 'number' ? rawCommunityId : Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }
  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const normalizedBody = { ...body, communityId };

  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireMeetingsEnabled(membership.communityType);
  requirePermission(membership, 'meetings', 'write');
  await requireActiveSubscriptionForMutation(communityId);

  if (action === 'update') return handleUpdate(normalizedBody, actorUserId);
  if (action === 'delete') return handleDelete(normalizedBody, actorUserId);
  if (action === 'attach') return handleAttach(normalizedBody, actorUserId);
  if (action === 'detach') return handleDetach(normalizedBody, actorUserId);
  return handleCreate(normalizedBody, actorUserId);
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCreate(body: Record<string, unknown>, actorUserId: string): Promise<NextResponse> {
  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid meeting data', { fields: formatZodErrors(parsed.error) });
  }
  const { communityId, ...data } = parsed.data;
  const scoped = createScopedClient(communityId);

  const [created] = await scoped.insert(meetings, {
    title: data.title,
    meetingType: data.meetingType,
    startsAt: new Date(data.startsAt),
    location: data.location,
  });

  const createdId = String((created as Record<string, unknown>)['id']);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'meeting',
    resourceId: createdId,
    communityId,
    newValues: {
      title: data.title,
      meetingType: data.meetingType,
      startsAt: data.startsAt,
      location: data.location,
    },
  });

  // Await notification dispatch so digest enqueue writes are durable in-request.
  const startsAtDate = new Date(data.startsAt);
  const meetingTypeForEmail = data.meetingType === 'board' || data.meetingType === 'committee'
    ? 'board' as const
    : data.meetingType === 'special'
      ? 'special' as const
      : 'owner' as const;

  // Fetch community timezone so email displays the correct local time.
  const communityRows = await scoped.selectFrom(communities, { timezone: communities.timezone }, eq(communities.id, communityId));
  const communityTimezone = resolveTimezone(communityRows[0]?.['timezone'] as string | undefined);

  try {
    await queueNotification(
      communityId,
      {
        type: 'meeting_notice',
        meetingTitle: data.title,
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
        location: data.location,
        meetingType: meetingTypeForEmail,
        sourceType: 'meeting',
        sourceId: createdId,
      },
      'all',
      actorUserId,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[meetings] notification dispatch failed', {
      communityId,
      meetingId: createdId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}

async function handleUpdate(body: Record<string, unknown>, actorUserId: string): Promise<NextResponse> {
  const parsed = updateMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid update data', { fields: formatZodErrors(parsed.error) });
  }
  const { id, communityId, ...fields } = parsed.data;
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(meetings);
  const existing = rows.find((r) => (r as Record<string, unknown>)['id'] === id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) throw new NotFoundError('Meeting not found');

  const updateData: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  if (fields.title !== undefined) {
    updateData['title'] = fields.title;
    oldValues['title'] = existing['title'];
    newValues['title'] = fields.title;
  }
  if (fields.meetingType !== undefined) {
    updateData['meetingType'] = fields.meetingType;
    oldValues['meetingType'] = existing['meetingType'];
    newValues['meetingType'] = fields.meetingType;
  }
  if (fields.startsAt !== undefined) {
    updateData['startsAt'] = new Date(fields.startsAt);
    oldValues['startsAt'] = existing['startsAt'];
    newValues['startsAt'] = fields.startsAt;
  }
  if (fields.location !== undefined) {
    updateData['location'] = fields.location;
    oldValues['location'] = existing['location'];
    newValues['location'] = fields.location;
  }

  const [updated] = await scoped.update(meetings, updateData, eq(meetings.id, id));

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'meeting',
    resourceId: String(id),
    communityId,
    oldValues,
    newValues,
  });

  return NextResponse.json({ data: updated });
}

async function handleDelete(body: Record<string, unknown>, actorUserId: string): Promise<NextResponse> {
  const parsed = deleteMeetingSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid delete data', { fields: formatZodErrors(parsed.error) });
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

async function handleAttach(body: Record<string, unknown>, actorUserId: string): Promise<NextResponse> {
  const parsed = attachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid attachment data', { fields: formatZodErrors(parsed.error) });
  }
  const { communityId, meetingId, documentId } = parsed.data;
  const scoped = createScopedClient(communityId);

  // Verify both the meeting and document belong to this community
  const meetingRows = await scoped.selectFrom(meetings, {}, eq(meetings.id, meetingId));
  if (meetingRows.length === 0) {
    throw new NotFoundError('Meeting not found');
  }
  const docRows = await scoped.selectFrom(documents, {}, eq(documents.id, documentId));
  if (docRows.length === 0) {
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
    resourceId: String(rows[0]?.['id'] ?? ''),
    communityId,
    newValues: { meetingId, documentId },
    metadata: { subAction: 'attach' },
  });

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

async function handleDetach(body: Record<string, unknown>, actorUserId: string): Promise<NextResponse> {
  const parsed = detachDocSchema.safeParse(body);
  if (!parsed.success) {
    throw new UnprocessableEntityError('Invalid detach data', { fields: formatZodErrors(parsed.error) });
  }
  const { communityId, meetingId, documentId } = parsed.data;
  const scoped = createScopedClient(communityId);

  // Verify both the meeting and document belong to this community
  const meetingRows = await scoped.selectFrom(meetings, {}, eq(meetings.id, meetingId));
  if (meetingRows.length === 0) {
    throw new NotFoundError('Meeting not found');
  }
  const docRows = await scoped.selectFrom(documents, {}, eq(documents.id, documentId));
  if (docRows.length === 0) {
    throw new NotFoundError('Document not found');
  }

  await scoped.hardDelete(
    meetingDocuments,
    and(eq(meetingDocuments.meetingId, meetingId), eq(meetingDocuments.documentId, documentId)),
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
