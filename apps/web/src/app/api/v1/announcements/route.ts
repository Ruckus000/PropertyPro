/**
 * Announcements API — CRUD operations for community announcements.
 *
 * All mutations use:
 * - withErrorHandler for structured error responses
 * - withAuditLog for compliance audit trail
 * - createScopedClient for cross-tenant isolation
 * - Zod validation for input
 *
 * P1-17c: Publish flow queues non-blocking announcement email delivery.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  type Announcement,
  announcements,
  logAuditEvent,
  users,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
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
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requirePermission } from '@/lib/db/access-control';

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

// ---------------------------------------------------------------------------
// Sanitization — allowlist-based HTML sanitizer (server-safe, no DOM needed)
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
]);
const ALLOWED_ATTRS = new Set(['href', 'target', 'rel']);

function sanitizeHtml(dirty: string): string {
  // Replace HTML tags: keep allowed tags with allowed attrs, strip everything else
  return dirty.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) return '';

    // Self-closing tags
    if (match.startsWith('</')) return `</${lowerTag}>`;

    // Filter attributes to allowed set
    const cleanAttrs: string[] = [];
    if (attrs) {
      const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs)) !== null) {
        const attrName = attrMatch[1]!.toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        if (!ALLOWED_ATTRS.has(attrName)) continue;
        // Block javascript: URLs in href
        if (attrName === 'href' && /^\s*javascript\s*:/i.test(attrValue)) continue;
        cleanAttrs.push(`${attrName}="${attrValue.replace(/"/g, '&quot;')}"`);
      }
    }

    const attrStr = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    const selfClose = match.endsWith('/>') ? ' /' : '';
    return `<${lowerTag}${attrStr}${selfClose}>`;
  });
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
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(announcements);

  // Filter out archived unless requested, then sort: pinned first, then by publishedAt desc
  const filtered = includeArchived
    ? rows
    : rows.filter((r) => r['archivedAt'] == null);

  const sorted = (filtered as Announcement[]).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return NextResponse.json({ data: sorted });
});

// ---------------------------------------------------------------------------
// POST — Create, update, pin/unpin, or archive an announcement
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  withAuditLog(
    async (req: NextRequest) => {
      const body = await req.clone().json() as Record<string, unknown>;
      const rawCommunityId = body['communityId'];
      const parsedCommunityId = typeof rawCommunityId === 'number' ? rawCommunityId : Number(rawCommunityId);
      if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
        throw new ValidationError('communityId must be a positive integer');
      }
      const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);

      const userId = await requireAuthenticatedUserId();
      const membership = await requireCommunityMembership(communityId, userId);
      requirePermission(membership, 'announcements', 'write');
      await requireActiveSubscriptionForMutation(communityId);

      return { userId, communityId };
    },
    async (req, _ctx, audit) => {
      const body = await req.json() as Record<string, unknown>;
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

      // Default: create
      return handleCreate(normalizedBody, audit);
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
  const scoped = createScopedClient(communityId);

  const rows = await scoped.insert(announcements, {
    ...data,
    body: sanitizedBody,
    publishedBy: audit.userId,
  });
  const created = rows[0] as Announcement;

  await audit.log({
    action: 'create',
    resourceType: 'announcement',
    resourceId: String(created.id),
    newValues: { title: data.title, audience: data.audience, isPinned: data.isPinned },
  });

  const authorRows = await scoped.query(users);
  const author = authorRows.find((row) => row['id'] === audit.userId);
  const authorName =
    typeof author?.['fullName'] === 'string'
      ? (author['fullName'] as string)
      : 'Community Team';

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

  return NextResponse.json({ data: created }, { status: 201 });
}

async function handleUpdate(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = updateAnnouncementSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid update data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, ...fields } = result.data;
  const scoped = createScopedClient(communityId);

  // Fetch existing to capture old values for audit
  const existing = (await scoped.query(announcements)).find(
    (r) => (r as Announcement).id === id,
  ) as Announcement | undefined;

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

  const updated = await scoped.update(
    announcements,
    newValues,
    eq(announcements.id, id),
  );

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues,
    newValues,
  });

  return NextResponse.json({ data: updated[0] });
}

async function handlePin(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = pinActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid pin action data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, isPinned } = result.data;
  const scoped = createScopedClient(communityId);

  const existing = (await scoped.query(announcements)).find(
    (r) => (r as Announcement).id === id,
  ) as Announcement | undefined;

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  const updated = await scoped.update(
    announcements,
    { isPinned },
    eq(announcements.id, id),
  );

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues: { isPinned: existing.isPinned },
    newValues: { isPinned },
    metadata: { subAction: 'pin' },
  });

  return NextResponse.json({ data: updated[0] });
}

async function handleArchive(body: Record<string, unknown>, audit: AuditLog): Promise<NextResponse> {
  const result = archiveActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid archive action data', {
      fields: formatZodErrors(result.error),
    });
  }

  const { id, communityId, archive } = result.data;
  const scoped = createScopedClient(communityId);

  const existing = (await scoped.query(announcements)).find(
    (r) => (r as Announcement).id === id,
  ) as Announcement | undefined;

  if (!existing) {
    throw new NotFoundError('Announcement not found');
  }

  const archivedAt = archive ? new Date() : null;
  const updated = await scoped.update(
    announcements,
    { archivedAt },
    eq(announcements.id, id),
  );

  await audit.log({
    action: 'update',
    resourceType: 'announcement',
    resourceId: String(id),
    oldValues: { archivedAt: existing.archivedAt },
    newValues: { archivedAt },
    metadata: { subAction: archive ? 'archive' : 'unarchive' },
  });

  return NextResponse.json({ data: updated[0] });
}
