/**
 * Announcements API — CRUD operations for community announcements.
 *
 * All mutations use:
 * - withErrorHandler for structured error responses
 * - withAuditLog for compliance audit trail
 * - announcement-service helpers for scoped DB access
 * - Zod validation for input
 *
 * P1-17c: Publish flow queues non-blocking announcement email delivery.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  logAuditEvent,
  type Announcement,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuditLog } from '@/lib/middleware/audit-middleware';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  queueAnnouncementDelivery,
  type AnnouncementAudience,
} from '@/lib/services/announcement-delivery';
import { createNotificationsForEvent } from '@/lib/services/notification-service';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
import {
  createAnnouncementForCommunity,
  getAnnouncementAuthorName,
  getAnnouncementById,
  getAnnouncementByIdIncludingDeleted,
  restoreAnnouncementForCommunity,
  softDeleteAnnouncementForCommunity,
  updateAnnouncementForCommunity,
} from '@/lib/services/announcement-service';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  body: z.string().min(1, 'Body is required'),
  audience: z.enum(['all', 'owners_only', 'board_only', 'tenants_only']).default('all'),
  isPinned: z.boolean().default(false),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
});

const updateAnnouncementSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer').optional(),
  body: z.string().min(1, 'Body is required').optional(),
  audience: z.enum(['all', 'owners_only', 'board_only', 'tenants_only']).optional(),
  isPinned: z.boolean().optional(),
});

const pinActionSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
  isPinned: z.boolean(),
});

const archiveActionSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
  archive: z.boolean(),
});

const restoreActionSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
});

const deleteAnnouncementSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
});

const listAnnouncementsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const parsedBodyCache = new WeakMap<NextRequest, Promise<Record<string, unknown>>>();

async function getParsedBody(req: NextRequest): Promise<Record<string, unknown>> {
  let parsed = parsedBodyCache.get(req);
  if (!parsed) {
    parsed = req.json().then((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return value as Record<string, unknown>;
    });
    parsedBodyCache.set(req, parsed);
  }

  return parsed;
}


// ---------------------------------------------------------------------------
// GET — List announcements (pinned first, chronological)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityIdParam = searchParams.get('communityId');
  const includeArchived = searchParams.get('includeArchived') === 'true';

  if (!communityIdParam) {
    throw new ValidationError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(communityIdParam);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }
  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'announcements', 'read');
  const parsedQuery = listAnnouncementsQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parsedQuery.error),
    });
  }
  const query = searchParams.get('q')?.trim() ?? '';
  const { rows, pagination } = await listVisibleAnnouncements(communityId, membership, {
    includeArchived,
    query,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });

  // B2: board/owner/tenant checklists carry `review_announcement`. Fire on list
  // load so those roles can reach 100% (fired unconditionally — residents can't
  // create announcements; a no-op for roles without this key).
  void tryAutoComplete(communityId, userId, 'review_announcement');

  return NextResponse.json({
    data: {
      data: rows,
      pagination,
    },
  });
});

// ---------------------------------------------------------------------------
// POST — Create, update, pin/unpin, or archive an announcement
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  withAuditLog(
    async (req: NextRequest) => {
      const body = await getParsedBody(req);
      const rawCommunityId = body['communityId'];
      const parsedCommunityId = typeof rawCommunityId === 'number' ? rawCommunityId : Number(rawCommunityId);
      if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
        throw new ValidationError('communityId must be a positive integer');
      }
      const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
      await assertNotDemoGrace(communityId);

      const userId = await requireAuthenticatedUserId();
      const membership = await requireCommunityMembership(communityId, userId);
      requirePermission(membership, 'announcements', 'write');
      await requireActiveSubscriptionForMutation(communityId);

      return { userId, communityId };
    },
    async (req, _ctx, audit) => {
      const body = await getParsedBody(req);
      const normalizedBody: Record<string, unknown> = {
        ...body,
        communityId: audit.communityId,
      };
      const action = normalizedBody['action'] as string | undefined;

      // Route to the appropriate handler based on action
      if (action === 'update') {
        return handleUpdate(normalizedBody, audit);
      }
      if (action === 'pin') {
        return handlePin(normalizedBody, audit);
      }
      if (action === 'archive') {
        return handleArchive(normalizedBody, audit);
      }
      if (action === 'restore') {
        return handleRestore(normalizedBody, audit);
      }

      // Default: create
      return handleCreate(normalizedBody, audit);
    },
  ),
);

// ---------------------------------------------------------------------------
// DELETE — Soft-delete an announcement (author or admin)
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  withAuditLog(
    async (req: NextRequest) => {
      const body = await getParsedBody(req);
      const rawCommunityId = body['communityId'];
      const parsedCommunityId = typeof rawCommunityId === 'number' ? rawCommunityId : Number(rawCommunityId);
      if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
        throw new ValidationError('communityId must be a positive integer');
      }
      const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
      await assertNotDemoGrace(communityId);

      const userId = await requireAuthenticatedUserId();
      await requireCommunityMembership(communityId, userId);
      await requireActiveSubscriptionForMutation(communityId);

      return { userId, communityId };
    },
    async (req, _ctx, audit) => {
      const body = await getParsedBody(req);
      const result = deleteAnnouncementSchema.safeParse({
        ...body,
        communityId: audit.communityId,
      });
      if (!result.success) {
        throw new ValidationError('Invalid delete data', {
          fields: formatZodErrors(result.error),
        });
      }

      const { id, communityId } = result.data;
      const existing = await getAnnouncementById(communityId, id);

      if (!existing) {
        throw new NotFoundError('Announcement not found');
      }

      const membership = await requireCommunityMembership(communityId, audit.userId);
      const isAuthor = existing.publishedBy === audit.userId;
      const canModerate =
        membership.isAdmin &&
        checkPermissionV2(membership.role, membership.communityType, 'announcements', 'write', {
          isUnitOwner: membership.isUnitOwner,
        });
      if (!isAuthor && !canModerate) {
        throw new ForbiddenError('You can only delete your own announcements');
      }

      await softDeleteAnnouncementForCommunity(communityId, id);

      await audit.log({
        action: 'delete',
        resourceType: 'announcement',
        resourceId: String(id),
        oldValues: { title: existing.title, audience: existing.audience },
        metadata: {
          removalType: isAuthor ? 'author_self_delete' : 'admin_removal',
        },
      });

      return NextResponse.json({ data: { id, deleted: true } });
    },
  ),
);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

interface AuditLog {
  userId: string;
  communityId: number;
  log(params: {
    action: 'create' | 'update' | 'delete';
    resourceType: string;
    resourceId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

async function handleCreate(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = createAnnouncementSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid announcement data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { communityId, ...data } = result.data;
  const sanitizedBody = sanitizeHtml(data.body);

  const created = await createAnnouncementForCommunity(communityId, {
    ...data,
    body: sanitizedBody,
    publishedBy: audit.userId,
  });

  await audit.log({
    action: 'create',
    resourceType: 'announcement',
    resourceId: String(created.id),
    newValues: { title: data.title, audience: data.audience, isPinned: data.isPinned },
  });

  const authorName = await getAnnouncementAuthorName(communityId, audit.userId);

  try {
    const recipientCount = await queueAnnouncementDelivery({
      communityId,
      announcementId: created.id,
      audience: data.audience as AnnouncementAudience,
      title: data.title,
      body: data.body,
      isPinned: data.isPinned,
      authorName,
    });

    await logAuditEvent({
      userId: audit.userId,
      action: 'announcement_email_sent',
      resourceType: 'announcement',
      resourceId: String(created.id),
      communityId,
      metadata: {
        recipientCount,
        audience: data.audience,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[announcements] delivery failed', {
      communityId,
      announcementId: created.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const audienceFilter: import('@/lib/services/notification-service').RecipientFilter =
    data.audience === 'owners_only' ? 'owners_only'
    : data.audience === 'board_only' ? 'board_only'
    : 'all';

  void createNotificationsForEvent(
    communityId,
    {
      category: 'announcement',
      title: data.title,
      body: data.body.replace(/<[^>]+>/g, '').slice(0, 120) || undefined,
      actionUrl: `/announcements/${created.id}`,
      sourceType: 'announcement',
      sourceId: String(created.id),
    },
    audienceFilter,
    audit.userId,
  ).catch((err: unknown) => {
    console.error('[announcements] in-app notification failed', { communityId, announcementId: created.id, error: err instanceof Error ? err.message : String(err) });
  });

  void tryAutoComplete(communityId, audit.userId, 'post_announcement');

  return NextResponse.json({ data: created });
}

async function handleUpdate(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = updateAnnouncementSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid update data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, ...fields } = result.data;

  // Fetch existing to capture old values for audit
  const existing = await getAnnouncementById(communityId, id);

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  if (fields.body !== undefined) {
    fields.body = sanitizeHtml(fields.body);
  }

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      oldValues[key] = existing[key as keyof Announcement];
      newValues[key] = value;
    }
  }

  const updated = await updateAnnouncementForCommunity(communityId, id, newValues);

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues,
    newValues,
  });

  return NextResponse.json({ data: updated });
}

async function handlePin(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = pinActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid pin action data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, isPinned } = result.data;
  const existing = await getAnnouncementById(communityId, id);

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  const updated = await updateAnnouncementForCommunity(communityId, id, { isPinned });

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues: { isPinned: existing.isPinned },
    newValues: { isPinned },
    metadata: { subAction: 'pin' },
  });

  return NextResponse.json({ data: updated });
}

async function handleRestore(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = restoreActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid restore action data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId } = result.data;
  const existing = await getAnnouncementByIdIncludingDeleted(communityId, id);

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  const updated = await restoreAnnouncementForCommunity(communityId, id);

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues: { deletedAt: existing.deletedAt },
    newValues: { deletedAt: null },
    metadata: { subAction: 'restore' },
  });

  return NextResponse.json({ data: updated ?? existing });
}

async function handleArchive(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = archiveActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid archive action data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, archive } = result.data;
  const existing = await getAnnouncementById(communityId, id);

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  const archivedAt = archive ? new Date() : null;
  const updated = await updateAnnouncementForCommunity(communityId, id, { archivedAt });

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues: { archivedAt: existing.archivedAt },
    newValues: { archivedAt },
    metadata: { subAction: archive ? 'archive' : 'unarchive' },
  });

  return NextResponse.json({ data: updated });
}
