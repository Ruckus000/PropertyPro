/**
 * Route contract for `GET /api/v1/public/communities/search`.
 *
 * Plan A1 drain #153. Public discovery search (Join-Community page). No session
 * auth — rate-limited by client IP in-handler. Cross-tenant search lives in
 * `community-search-service` behind AUTHZ-documented unsafe client.
 *
 * Response: `z.array(z.unknown())` — public projection rows; consumer pins shape
 * via `CommunitySearchResult` in community-search.tsx.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const publicCommunitiesSearchGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/public/communities/search',
  request: {
    query: z.object({
      q: z.string().trim().min(2).max(100),
      city: z.string().trim().max(100).optional(),
    }),
  },
  response: z.array(z.unknown()),
  permission: { resource: 'communities', action: 'read' },
});
