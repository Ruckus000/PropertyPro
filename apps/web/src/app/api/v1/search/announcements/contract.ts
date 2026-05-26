/**
 * Route contract for `GET /api/v1/search/announcements`.
 *
 * Plan A1 Bundle PR #3, drain #54. Command-palette announcement search.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('announcements', 'read')
 *     → searchVisibleAnnouncements(communityId, membership, q, limit)
 *
 * Query schema mirrors the bundle's shared shape:
 *   - `q` optional (handler short-circuits on empty/short input)
 *   - `limit` optional, clamped to [1, 20] (default 3)
 *   - `communityId` optional (header fallback via resolveEffectiveCommunityId)
 *
 * Response intentionally loose (`z.array(z.unknown())` for `results`) — each
 * search route's row shape differs and the trigram service returns rows
 * carrying typed identifiers that aren't worth modeling here.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchAnnouncementsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/announcements',
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
  permission: { resource: 'announcements', action: 'read' },
});
