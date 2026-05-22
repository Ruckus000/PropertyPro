/**
 * Route contract for `GET /api/v1/notifications/unread-count`.
 *
 * Returns the count of unread, non-deleted notifications for the current
 * user within their active community. Used by the nav bell badge.
 *
 * Plan A1 drain #5 — mirrors drain #2's (`users/names`) query-only shape
 * with a single scalar response. The runner wraps the handler's return as
 * `{ data: { count } }` (single-wrap), matching the pre-migration wire
 * shape exactly so the `useUnreadCount` consumer needs no changes.
 *
 * Authorization: tenant-scoped, any community member can read their own
 * unread count. Enforced in `./route.ts` via `requireAuthenticatedUserId`
 * + `requireCommunityMembership` after `resolveEffectiveCommunityId`
 * reconciles the `x-community-id` header against the query param.
 *
 * Placeholder `permission: { resource: 'settings', action: 'read' }`
 * records the closest semantic match in `RBAC_RESOURCES`; the contract
 * runner does NOT enforce this today (Plan A1 metadata only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const unreadCountQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

const unreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const notificationsUnreadCountContract = defineRoute({
  method: 'GET',
  path: '/api/v1/notifications/unread-count',
  request: {
    query: unreadCountQuerySchema,
  },
  response: unreadCountResponseSchema,
  permission: { resource: 'settings', action: 'read' },
});
