/**
 * GET /api/v1/notifications
 *
 * Returns a paginated list of in-app notifications for the current user
 * within a community. Excludes archived and soft-deleted rows.
 *
 * Plan A1 drain #103 — migrated to `runRoute()` from `@propertypro/api-contract`.
 * See `./contract.ts` for schemas and `unread_only` parsing rationale.
 *
 * Cursor-based pagination via `paginateNotificationsForUser()` (Plan B3).
 * Response envelope: `{ data: { data: NotificationItem[], pagination } } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NotificationCategory } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { paginateNotificationsForUser } from '@/lib/services/notification-service';
import { notificationsListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(notificationsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await requireCommunityMembership(communityId, userId);

    const unreadOnlyParam = new URL(req.url).searchParams.get('unread_only');
    const unreadOnly = unreadOnlyParam === 'true';

    const result = await paginateNotificationsForUser({
      communityId,
      userId,
      cursor: query.cursor,
      pageSize: query.limit,
      category: query.category as NotificationCategory | undefined,
      unreadOnly,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);
