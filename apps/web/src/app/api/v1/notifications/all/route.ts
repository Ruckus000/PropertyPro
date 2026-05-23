/**
 * GET /api/v1/notifications/all
 *
 * Aggregated notification feed across all communities the current user
 * belongs to. The user is the authorization anchor: we resolve their
 * authorized community ids via `user_roles` (via the unscoped
 * `findUserCommunitiesUnscoped` lookup, guarded by the `// AUTHZ:`
 * escape-hatch convention), then run per-community scoped queries via
 * `listCrossCommunityNotificationsForUser` so the RLS-enforced
 * `createScopedClient` boundary is preserved for every row we return.
 * Results are merged in-memory by notification id (descending).
 *
 * Per-community list+count moved into `listCrossCommunityNotificationsForUser`
 * on `notification-service` (A3 drain #55). The route still owns the
 * cross-community orchestration: dedup of communities, parallel fetch,
 * merge-sort by id, page-cap with `hasMore` + numeric cursor, unread sum.
 *
 * Plan A1 drain #15 — input validation (rich query: limit/cursor/unreadOnly)
 * and response-envelope wrapping delegated to `runRoute()` from
 * `@propertypro/api-contract`. Differences from the prior drain corpus:
 *
 *   - Rich query schema (3 fields) like drain #2 / drain #12, but the
 *     handler still uses every field directly in its hand-rolled pagination
 *     loop.
 *   - Hand-rolled cursor pagination (numeric id-based) — NOT the canonical
 *     `paginate()` helper. Documented in the contract docblock as a
 *     deliberate choice: cross-community aggregates can't be expressed as
 *     a single-table keyset scan.
 *   - Single-wrap response envelope `{ data: { notifications, nextCursor,
 *     totalUnread } }`, NOT the double-wrap `{ data: { data, pagination } }`
 *     shape that `paginated: true` produces. The `nextCursor` /
 *     `totalUnread` are just response fields from the runner's POV.
 *   - Per-item `notifications` shape declared as `z.unknown()` (loose-
 *     aggregate philosophy, same as drains #8 / #12) — consumer-side
 *     `CrossNotificationItem` interface pins the wire shape on the client.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → findUserCommunitiesUnscoped(userId)
 *     → empty short-circuit OR
 *       Promise.all(listCrossCommunityNotificationsForUser per community)
 *     → merge/sort/page/sum logic
 *     → return { notifications, nextCursor, totalUnread }
 *
 * Behavior changes:
 *   - 400 body shape becomes the canonical `VALIDATION_ERROR` envelope
 *     (was a hand-constructed `ValidationError` carrying
 *     `{ issues: parsed.error.issues }`). Status unchanged (400).
 *   - 200 wire shape is byte-identical:
 *       { data: { notifications: [...], nextCursor: number|null, totalUnread: number } }
 *
 * The consumer hook (`useCrossNotifications` in
 * `apps/web/src/hooks/use-notifications.ts`) reads
 * `(await res.json()) as { data: CrossListResponse }; return json.data;` —
 * compatible with both pre-migration and post-migration envelopes. No
 * consumer changes required.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
// AUTHZ: Cross-community notifications — aggregated feed across all communities the user belongs to.
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';
import { listCrossCommunityNotificationsForUser } from '@/lib/services/notification-service';
import { notificationsAllContract } from './contract';

export const GET = withErrorHandler(
  runRoute(notificationsAllContract, async ({ query }) => {
    const userId = await requireAuthenticatedUserId();

    // Resolve the user's authorized community set (via user_roles,
    // scoped by user).
    const userCommunities = await findUserCommunitiesUnscoped(userId);
    if (userCommunities.length === 0) {
      return { notifications: [], nextCursor: null, totalUnread: 0 };
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

    const { limit, cursor, unreadOnly } = query;

    // Per-community list + unread-count queries run through the scoped
    // client so the RLS-enforced community_id boundary is preserved for
    // every row.
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
    const merged = perCommunity.flatMap((c) => c.list).sort((a, b) => b.id - a.id);
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

    return { notifications: items, nextCursor, totalUnread };
  }),
);
