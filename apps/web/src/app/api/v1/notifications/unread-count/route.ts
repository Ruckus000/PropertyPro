/**
 * GET /api/v1/notifications/unread-count
 *
 * Returns the count of unread, non-deleted notifications for the current
 * user within their active community. Powers the nav bell badge.
 *
 * Plan A1 drain #5. Input validation (query) and output validation +
 * canonical envelope wrapping are delegated to `runRoute()` from
 * `@propertypro/api-contract`. The wire response is unchanged:
 *
 *     { data: { count: <number> } }
 *
 * Consumer (`apps/web/src/hooks/use-notifications.ts` →
 * `useUnreadCount`) requires no changes — the runner produces exactly the
 * same envelope the pre-migration handler returned.
 *
 * Behavior change: malformed/missing `communityId` query now returns a
 * `VALIDATION_ERROR` envelope from the runner (with field details)
 * instead of a hand-constructed `ValidationError`. Status remains 400.
 * Header/query `communityId` mismatch returns 404 (canonical
 * `resolveEffectiveCommunityId` semantics), matching drains #2/#3/#4 —
 * for this route there was no prior 400-on-mismatch path (the previous
 * code passed the query value to `resolveEffectiveCommunityId` directly).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { countUnreadNotifications } from '@propertypro/db';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { notificationsUnreadCountContract } from './contract';

export const GET = withErrorHandler(
  runRoute(notificationsUnreadCountContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await requireCommunityMembership(communityId, userId);

    const count = await countUnreadNotifications(communityId, userId);
    return { count };
  }),
);
