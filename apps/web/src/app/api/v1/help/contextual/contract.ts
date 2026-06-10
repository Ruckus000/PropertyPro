/**
 * GET /api/v1/help/contextual — up to 8 help articles relevant to a UI path,
 * filtered by the caller's effective role in the community.
 *
 * Query: { path, communityId }. No body. No params.
 *
 * Auth chain (3 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → getContextualArticles(path, role, 8).
 *
 * Response modeling: loose z.unknown() — the route maps article objects to
 * a projection `{ title, description, category, slug }`. Loose modeling
 * matches the rest of the bundle.
 *
 * `permission` is OMITTED — 'help' is NOT in RBAC_RESOURCES.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const helpContextualGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/contextual',
  request: {
    query: z.object({
      path: z.string().min(1),
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
});
