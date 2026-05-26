/**
 * Route contract for `GET /api/v1/search/users`.
 *
 * Plan A1 Bundle PR #3, drain #59. Command-palette user search backing the
 * audit-log "who did what" filter. Permission resource is `audit` (not
 * `users`), matching the pre-migration `requirePermission(membership, 'audit', 'read')`
 * gate — users search is gated by audit-read because only audit-capable
 * roles need to look up users by name/email/unit.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('audit', 'read')
 *     → searchUsersByTrigram(communityId, q, sanitizedInput, limit)
 *
 * Default limit is 10 here (vs. 3 in the other search routes); the audit-log
 * UI shows more users at a time than the command palette.
 *
 * Loose `z.array(z.unknown())` response.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchUsersContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/users',
  request: {
    query: z.object({
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
      communityId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.object({
    results: z.array(z.unknown()),
    totalCount: z.number().int().nonnegative(),
    status: z.literal('ok'),
  }),
  permission: { resource: 'audit', action: 'read' },
});
