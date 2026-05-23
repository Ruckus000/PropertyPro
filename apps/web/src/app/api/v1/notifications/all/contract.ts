/**
 * Route contract for `GET /api/v1/notifications/all`.
 *
 * Plan A1 drain #15 — cross-community aggregated notifications feed.
 * Single-wrap object response with a nested array + 2 scalars
 * (`notifications`, `nextCursor`, `totalUnread`). Hand-rolled cursor
 * pagination (numeric id-based) — this route is NOT migrated to the
 * canonical `paginate()` helper; the cursor is a raw numeric id, and the
 * "merge across communities + sort + page-cap" logic stays in the route
 * handler.
 *
 * IMPORTANT: this is a NON-paginated contract (`paginated: false` /
 * omitted). The wire is the canonical single-wrap envelope
 * `{ data: { notifications, nextCursor, totalUnread } }` — NOT the
 * double-wrap `{ data: { data, pagination } }` shape that `paginated: true`
 * produces. The hand-rolled pagination is OPAQUE to the contract layer;
 * the `nextCursor` / `totalUnread` are just response fields.
 *
 * Authorization: session-anchored — the user is the anchor. The route
 * resolves the caller's authorized community ids via
 * `findUserCommunitiesUnscoped` (the `// AUTHZ:` escape-hatch import) and
 * runs per-community scoped queries via `listCrossCommunityNotificationsForUser`.
 * No `communityId` query/header parameter — this is a cross-community
 * aggregate (same family as drains #1, #6, #8, #12).
 *
 * Query schema preserved byte-identical to the pre-migration `querySchema`:
 *   - `limit`: page size, clamped 1..100, default 50
 *   - `cursor`: numeric notification id (opaque to client; echoed from a
 *     previous `nextCursor`)
 *   - `unreadOnly`: stringified boolean enum (`'true' | 'false'`); the
 *     route handler converts to a boolean before calling the service
 *
 * The runner's `||` empty-string handling lets `?cursor=` / `?limit=` /
 * `?unreadOnly=` collapse to `undefined` so optional fields don't 400 on
 * `min(1)` / `positive()`. Matches the convention in
 * `.claude/rules/api-patterns.md`.
 *
 * NOTE on response per-item shape: `notifications` is declared as
 * `z.array(z.unknown())`. Same loose-aggregate philosophy as drains #8 /
 * #12:
 *   1. The route projects each row into an inline object with a hydrated
 *      nested `community: {id, name, slug}` field. The per-item shape
 *      composes a `CrossNotification` row + a `CommunityMeta` lookup —
 *      both can evolve additively as new notification categories / source
 *      types ship.
 *   2. The consumer hook (`use-notifications.ts → useCrossNotifications`)
 *      already has a strongly typed `CrossNotificationItem` interface that
 *      pins the wire shape on the client side — the TypeScript type is
 *      the source of truth for the UI.
 *   3. Tightening to per-field `z.object({...})` would risk 500s on benign
 *      additive field changes in `listCrossCommunityNotificationsForUser`
 *      (e.g. a new metadata field).
 * The `contract_violation: response` Sentry canary still fires on
 * structural breakage of the OUTER envelope (missing `notifications` /
 * `nextCursor` / `totalUnread`, wrong types on the scalars).
 *
 * NOTE on permission: `{ resource: 'settings', action: 'read' }` is a
 * placeholder — `RBAC_RESOURCES` has no "notifications" resource, and
 * this endpoint isn't gated by the RBAC matrix (the session is the
 * authoritative gate; per-community RLS enforces row isolation inside
 * `listCrossCommunityNotificationsForUser`). `settings` matches the
 * convention set by drains #1 / #6 / #8 / #12 for session-anchored
 * cross-community endpoints. The contract runner does NOT enforce
 * `permission` today (Plan A1 foundation; metadata only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const notificationsAllQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export type NotificationsAllQuery = z.infer<typeof notificationsAllQuerySchema>;

export const notificationsAllResponseSchema = z.object({
  notifications: z.array(z.unknown()),
  nextCursor: z.number().int().positive().nullable(),
  totalUnread: z.number().int().nonnegative(),
});

export type NotificationsAllResponse = z.infer<typeof notificationsAllResponseSchema>;

export const notificationsAllContract = defineRoute({
  method: 'GET',
  path: '/api/v1/notifications/all',
  request: {
    query: notificationsAllQuerySchema,
  },
  response: notificationsAllResponseSchema,
  permission: { resource: 'settings', action: 'read' },
});
