/**
 * Route contract for `GET /api/v1/notifications`.
 *
 * Plan A1 drain #103. Paginated in-app notifications for the current user
 * within a community. Excludes archived and soft-deleted rows.
 *
 * Auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → paginateNotificationsForUser(...)
 *
 * `unread_only` is intentionally NOT in the Zod query schema — only the
 * literal query string `"true"` enables the filter (see handler). Declaring
 * it in Zod would invite `z.coerce.boolean()` traps where `"false"` is truthy.
 *
 * Wire envelope (paginated): `{ data: { data: rows[], pagination } }`.
 * Response is `z.unknown()` because notification rows may carry `Date` fields.
 *
 * `permission: { resource: 'settings', action: 'read' }` is a documented
 * placeholder — `RBAC_RESOURCES` has no `notifications` entry; the runner
 * does not enforce this metadata today.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const VALID_CATEGORIES = [
  'announcement',
  'document',
  'meeting',
  'maintenance',
  'violation',
  'election',
  'system',
] as const;

const notificationsListQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  // Default 20 preserves the route's prior pageSize default (not paginate's 50).
  limit: z.coerce.number().int().positive().default(20),
  category: z.enum(VALID_CATEGORIES).optional(),
});

export const notificationsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/notifications',
  request: {
    query: notificationsListQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'settings', action: 'read' },
});
