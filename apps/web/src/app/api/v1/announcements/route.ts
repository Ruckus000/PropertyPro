/**
 * Announcements API — list (GET), action-dispatch mutations (POST) and
 * soft-delete (DELETE) for community announcements.
 *
 * CON-05 (Phase 3.5): every verb goes through `runRoute(contract, handler)`.
 * GET declares `tenantScope: { in: 'query' }` (runner-resolved communityId);
 * POST and DELETE keep coercing `communityId` out of the body themselves, and
 * write their audit trail through `createAuditContext` (CON-06) — the body is
 * parsed once, by the runner. See `./contract.ts` for the exact deltas.
 *
 * P1-17c: Publish flow queues non-blocking announcement email delivery.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  logAuditEvent,
  type Announcement,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { createAuditContext, type AuditContext } from '@/lib/middleware/audit-middleware';
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
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
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
import {
  announcementsActionContract,
  announcementsDeleteContract,
  announcementsListContract,
} from './contract';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer'),
  body: z.string().min(1, 'Body is required'),
  audience: z.enum(['all', 'owners_only', 'board_only', 'tenants_only']).default('all'),
  isPinned: z.boolean().default(false),
  /**
   * Optional auto-removal instant, ISO-8601. Null / absent means "never
   * expires", which is every pre-existing announcement.
   *
   * `z.coerce.date()` so the wire stays a string while the column takes a
   * Date; coercion still REJECTS an unparseable value rather than storing an
   * Invalid Date, which would make the row's visibility undefined.
   */
  expiresAt: z.coerce.date().nullable().optional(),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
});

const updateAnnouncementSchema = z.object({
  id: z.number().int().positive('Announcement ID must be a positive integer'),
  communityId: z.number().int().positive('Community ID must be a positive integer'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or fewer').optional(),
  body: z.string().min(1, 'Body is required').optional(),
  audience: z.enum(['all', 'owners_only', 'board_only', 'tenants_only']).optional(),
  isPinned: z.boolean().optional(),
  /**
   * Nullable so an expiry can be CLEARED, not only set. The update loop below
   * skips `undefined` and passes `null` through, so "absent" and "cleared" stay
   * distinguishable — without that, a seasonal notice could be given an expiry
   * and never given one back.
   */
  expiresAt: z.coerce.date().nullable().optional(),
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

/**
 * The runner parsed the body once (`z.unknown()`); normalise it the way the
 * legacy `getParsedBody` did. The runner swallows a JSON parse failure into
 * `undefined` — valid JSON never produces it — so that case is re-thrown as
 * the unhandled error the legacy `await req.json()` raised (→ 500
 * INTERNAL_ERROR, before any gate). JSON `null`, arrays and scalars become `{}`
 * as before, and then fail the communityId check.
 */
function normalizeBody(raw: unknown): Record<string, unknown> {
  if (raw === undefined) {
    throw new SyntaxError('Request body is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

/**
 * The pre-auth half of every mutation, unchanged from the legacy extractor:
 * coerce the body `communityId` (a string "42" is accepted), refuse junk with
 * the legacy message, and cross-check it against `x-community-id` (404 on a
 * mismatch). Pure parsing plus a header comparison — no DB read.
 */
function resolveBodyCommunityId(req: NextRequest, body: Record<string, unknown>): number {
  const rawCommunityId = body['communityId'];
  const parsedCommunityId = typeof rawCommunityId === 'number' ? rawCommunityId : Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }
  return resolveEffectiveCommunityId(req, parsedCommunityId);
}

// ---------------------------------------------------------------------------
// GET — List announcements (pinned first, chronological)
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(
  runRoute(announcementsListContract, async ({ query, req, communityId }) => {
    const userId = await requireAuthenticatedUserId();
    // `communityId` was resolved by the runner (tenantScope: query), which has
    // already refused a junk `?communityId=` (legacy message) and a header
    // mismatch. It gets here without `?communityId=` only when x-community-id
    // supplied the tenant; the param has always been required, so refuse that
    // with the legacy message, after auth, as before.
    if (query.communityId === undefined) {
      throw new ValidationError('communityId query parameter is required');
    }
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'announcements', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    // Re-read from `searchParams` (not `query`) so each value keeps its exact
    // legacy semantics — e.g. an empty `?q=` is '' here, never undefined.
    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const parsedQuery = listAnnouncementsQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid query parameters', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }
    const q = searchParams.get('q')?.trim() ?? '';
    const { rows, pagination } = await listVisibleAnnouncements(communityId, membership, {
      includeArchived,
      query: q,
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });

    // B2: board/owner/tenant checklists carry `review_announcement`. Fire on list
    // load so those roles can reach 100% (fired unconditionally — residents can't
    // create announcements; a no-op for roles without this key).
    void tryAutoComplete(communityId, userId, 'review_announcement');

    // Runner wraps once → `{ data: { data, pagination } }`. `pagination` is
    // absent when the community row is missing, and JSON drops it — the legacy
    // `{"data":{"data":[]}}` bytes (see contract.ts: why not `paginated: true`).
    return { data: rows, pagination };
  }),
);

// ---------------------------------------------------------------------------
// POST — Create, update, pin/unpin, archive, or restore an announcement
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(announcementsActionContract, async ({ body: rawBody, req }) => {
    const body = normalizeBody(rawBody);
    const communityId = resolveBodyCommunityId(req, body);

    // Demo-grace runs AFTER authentication (legacy ran it first — an unscoped
    // read on a caller-chosen id, before anything was known about the caller).
    // Delta pinned in route-contract.test.ts; see contract.ts.
    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'announcements', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    const audit = createAuditContext(req, { userId, communityId });
    const normalizedBody: Record<string, unknown> = { ...body, communityId };
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
  }),
);

// ---------------------------------------------------------------------------
// DELETE — Soft-delete an announcement (author or admin)
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(
  runRoute(announcementsDeleteContract, async ({ body: rawBody, req }) => {
    const body = normalizeBody(rawBody);
    const resolvedCommunityId = resolveBodyCommunityId(req, body);

    const userId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(resolvedCommunityId);
    await requireCommunityMembership(resolvedCommunityId, userId);
    await requireActiveSubscriptionForMutation(resolvedCommunityId);

    const audit = createAuditContext(req, { userId, communityId: resolvedCommunityId });
    const result = deleteAnnouncementSchema.safeParse({
      ...body,
      communityId: resolvedCommunityId,
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

    return { id, deleted: true };
  }),
);

// ---------------------------------------------------------------------------
// Handlers — each returns the inner payload; the runner wraps `{ data }`.
// ---------------------------------------------------------------------------

async function handleCreate(body: Record<string, unknown>, audit: AuditContext): Promise<unknown> {
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
    newValues: {
      title: data.title,
      audience: data.audience,
      isPinned: data.isPinned,
      expiresAt: data.expiresAt ? data.expiresAt.toISOString() : null,
    },
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
      authorUserId: audit.userId,
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

  // The four audiences map 1:1 onto RecipientFilter. `tenants_only` used to
  // fall through to 'all' here, which pushed a renters-only announcement —
  // title and body — into every owner's and manager's notification feed while
  // the email and in-app-list paths correctly excluded them.
  const audienceFilter: import('@/lib/services/notification-service').RecipientFilter =
    data.audience === 'owners_only' ? 'owners_only'
    : data.audience === 'tenants_only' ? 'tenants_only'
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

  return created;
}

async function handleUpdate(body: Record<string, unknown>, audit: AuditContext): Promise<unknown> {
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

  return updated;
}

async function handlePin(body: Record<string, unknown>, audit: AuditContext): Promise<unknown> {
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

  return updated;
}

async function handleRestore(body: Record<string, unknown>, audit: AuditContext): Promise<unknown> {
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

  return updated ?? existing;
}

async function handleArchive(body: Record<string, unknown>, audit: AuditContext): Promise<unknown> {
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

  return updated;
}
