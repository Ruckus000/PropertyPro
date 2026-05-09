/**
 * GET /api/v1/notifications/all
 *
 * Aggregated notification feed across all communities the current user belongs
 * to. The user is the authorization anchor: we resolve their authorized
 * community ids via user_roles, then run per-community scoped queries so the
 * RLS-enforced `createScopedClient` boundary is preserved for every row we
 * return. Results are merged in-memory by notification id (descending).
 *
 * Per-community list+count moved into `listCrossCommunityNotificationsForUser`
 * on `notification-service` (A3 drain #55). The route still owns the
 * cross-community orchestration: dedup of communities, parallel fetch,
 * merge-sort by id, page-cap with `hasMore` + numeric cursor, unread sum.
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
// AUTHZ: Cross-community notifications — aggregated feed across all communities the user belongs to.
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';
import { listCrossCommunityNotificationsForUser } from '@/lib/services/notification-service';

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

  // Resolve the user's authorized community set (via user_roles, scoped by user).
  const userCommunities = await findUserCommunitiesUnscoped(userId);
  if (userCommunities.length === 0) {
    return NextResponse.json({
      data: { notifications: [], nextCursor: null, totalUnread: 0 },
    });
  }

  // De-dup communities (a user can have multiple roles per community).
  const meta = new Map<number, { id: number; name: string; slug: string }>();
  for (const row of userCommunities) {
    if (!meta.has(row.communityId)) {
      meta.set(row.communityId, {
        id: row.communityId,
        name: row.communityName,
        slug: row.slug,
      });
    }
  }
  const communityIds = [...meta.keys()];

  const { limit, cursor, unreadOnly } = parsed.data;

  // Per-community list + unread-count queries run through the scoped client so
  // the RLS-enforced community_id boundary is preserved for every row.
  const perCommunity = await Promise.all(
    communityIds.map((communityId) =>
      listCrossCommunityNotificationsForUser({
        communityId,
        userId,
        cursor,
        limitPlusOne: limit + 1,
        unreadOnly: unreadOnly === 'true',
      }),
    ),
  );

  // Merge + sort by id desc globally, then take the page.
  const merged = perCommunity
    .flatMap((c) => c.list)
    .sort((a, b) => b.id - a.id);
  const hasMore = merged.length > limit;
  const page = hasMore ? merged.slice(0, limit) : merged;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
  const totalUnread = perCommunity.reduce((sum, c) => sum + c.unread, 0);

  const items = page.map((n) => {
    const c = meta.get(n.communityId);
    return {
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
        name: c?.name ?? '',
        slug: c?.slug ?? '',
      },
    };
  });

  return NextResponse.json({
    data: {
      notifications: items,
      nextCursor,
      totalUnread,
    },
  });
});
