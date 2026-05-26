/**
 * Route contract for `GET /api/v1/search/meetings`.
 *
 * Plan A1 Bundle PR #3, drain #57. Command-palette meeting search.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('meetings', 'read')
 *     → searchMeetingsByTrigram(communityId, q, limit)
 *
 * Loose `z.array(z.unknown())` response; rows include `starts_at` as a Date.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchMeetingsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/meetings',
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
  permission: { resource: 'meetings', action: 'read' },
});
