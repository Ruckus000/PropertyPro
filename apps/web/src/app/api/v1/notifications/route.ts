/**
 * GET /api/v1/notifications
 *
 * Returns a paginated list of in-app notifications for the current user
 * within a community. Excludes archived and soft-deleted rows.
 *
 * Migrated to the canonical `paginate()` helper from `@propertypro/db`
 * (Plan B3; see ADR-003 / Plan A2). Replaces the previous bespoke
 * cursor-based path that used `listNotifications()` with raw numeric
 * cursors and a custom response shape.
 *
 * Response envelope is double-wrapped per the paginated-route contract:
 *
 *     { data: { data: NotificationItem[], pagination: { nextCursor, hasMore, pageSize } } }
 *
 * Behavioral changes from the previous implementation:
 * - Cursor format: was a raw numeric id stringified, now opaque base64url
 *   issued by `paginate()`. Old numeric cursors will fail to decode and
 *   will silently fall back to "first page" per `paginate()`'s permissive
 *   contract. Acceptable because cursors are scoped to a single user
 *   session and aren't typically persisted long-term.
 * - Inner shape: was `{ notifications, nextCursor }`, now `{ data, pagination }`.
 * - Sort order: was `(createdAt DESC, id DESC)`, now `id DESC`. For the
 *   bigserial monotonic id this is equivalent.
 * - Limit cap: was 50 (hard 400 on >50), now 100 (silent clamp at paginate
 *   MAX_PAGE_SIZE). Default still 20 if not specified.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  notifications,
  paginate,
  type NotificationCategory,
} from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const VALID_CATEGORIES = [
  'announcement',
  'document',
  'meeting',
  'maintenance',
  'violation',
  'election',
  'system',
] as const;

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  // Default 20 preserves the route's prior pageSize default. Without this,
  // omitting `limit` would fall through to paginate()'s DEFAULT_PAGE_SIZE (50).
  limit: z.coerce.number().int().positive().default(20),
  category: z.enum(VALID_CATEGORIES).optional(),
  // `z.coerce.boolean()` is unsafe for query strings: `Boolean("false") === true`.
  // Treat the param as a flag — only the literal string "true" enables it; any
  // other value (including "false", "0", missing) means "filter off".
  unread_only: z.preprocess((val) => val === 'true', z.boolean()).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  // Use `||` not `??` so empty-string query params (`?cursor=`, `?limit=`,
  // `?category=`, `?unread_only=`) collapse to undefined rather than passing
  // `""` to Zod, which would 400 on `min(1)` / `positive()` / `enum`
  // constraints. The `unread_only` preprocessing also benefits — empty string
  // becomes undefined → optional → no filter.
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    cursor: searchParams.get('cursor') || undefined,
    limit: searchParams.get('limit') || undefined,
    category: searchParams.get('category') || undefined,
    unread_only: searchParams.get('unread_only') || undefined,
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters');
  }

  const { cursor, limit, category, unread_only } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  // Build the where predicate: user-scoped within this community, excluding
  // archived rows. The scoped client already filters by communityId and
  // deletedAt; we add userId + archivedAt + optional category/unread_only.
  const conditions = [
    eq(notifications.userId, userId),
    isNull(notifications.archivedAt),
  ];
  if (category != null) {
    conditions.push(eq(notifications.category, category as NotificationCategory));
  }
  if (unread_only) {
    conditions.push(isNull(notifications.readAt));
  }
  const where = and(...conditions);

  const scoped = createScopedClient(communityId);
  const result = await paginate(scoped, notifications, { cursor, pageSize: limit }, { where });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});
