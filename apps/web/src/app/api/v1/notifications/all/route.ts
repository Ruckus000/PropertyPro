/**
 * GET /api/v1/notifications/all
 *
 * Aggregated notification feed across all communities the current user belongs
 * to. The user is the authorization anchor: we resolve their authorized
 * community ids, then filter by `user_id = current` AND
 * `community_id IN (authorizedIds)`.
 *
 * Response shape:
 *   data: {
 *     notifications: CrossNotification[],
 *     nextCursor: number | null,
 *     totalUnread: number,
 *   }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { notifications, communities } from '@propertypro/db';
import { and, desc, eq, inArray, isNull, lt, sql } from '@propertypro/db/filters';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    unreadOnly: searchParams.get('unreadOnly') ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid query', { issues: parsed.error.issues });
  }

  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) {
    return NextResponse.json({
      data: { notifications: [], nextCursor: null, totalUnread: 0 },
    });
  }

  const db = createUnscopedClient();

  // Authorization: user_id anchor + community_id in authorized set.
  const conditions = [
    eq(notifications.userId, userId),
    inArray(notifications.communityId, communityIds),
    isNull(notifications.archivedAt),
    isNull(notifications.deletedAt),
  ];
  if (parsed.data.cursor != null) {
    conditions.push(lt(notifications.id, parsed.data.cursor));
  }
  if (parsed.data.unreadOnly === 'true') {
    conditions.push(isNull(notifications.readAt));
  }

  const rows = await db
    .select({
      id: notifications.id,
      category: notifications.category,
      title: notifications.title,
      body: notifications.body,
      actionUrl: notifications.actionUrl,
      sourceType: notifications.sourceType,
      sourceId: notifications.sourceId,
      priority: notifications.priority,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      communityId: notifications.communityId,
      communityName: communities.name,
      communitySlug: communities.slug,
    })
    .from(notifications)
    .innerJoin(communities, eq(communities.id, notifications.communityId))
    .where(and(...conditions))
    .orderBy(desc(notifications.id))
    .limit(parsed.data.limit + 1);

  const hasMore = rows.length > parsed.data.limit;
  const page = hasMore ? rows.slice(0, parsed.data.limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  const unreadCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.communityId, communityIds),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
        isNull(notifications.deletedAt),
      ),
    );
  const totalUnread = unreadCountRows[0]?.count ?? 0;

  const items = page.map((n) => ({
    id: n.id,
    category: n.category,
    title: n.title,
    body: n.body,
    actionUrl: n.actionUrl,
    sourceType: n.sourceType,
    sourceId: n.sourceId,
    priority: n.priority,
    readAt: n.readAt,
    createdAt: n.createdAt,
    community: {
      id: n.communityId,
      name: n.communityName,
      slug: n.communitySlug,
    },
  }));

  return NextResponse.json({
    data: {
      notifications: items,
      nextCursor,
      totalUnread,
    },
  });
});
