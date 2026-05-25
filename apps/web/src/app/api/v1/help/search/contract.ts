/**
 * GET /api/v1/help/search — parallel search of platform articles and
 * community FAQs.
 *
 * Query: { q (2..200 chars), communityId }. No body. No params.
 *
 * Auth chain (3 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → (feature-gate filter + parallel
 * searchArticles + searchCommunityFaqs + Sentry zero-result telemetry).
 *
 * Response modeling: loose z.unknown() — the wire shape is
 * `{ data: { articles: [...], faqs: [...] } }`; FAQs come from a service
 * with Date fields and an evolving shape (drain #14/#18 lesson). Modeled
 * loose to avoid safeParse failures before serialization.
 *
 * `permission` is OMITTED — 'help' is NOT in RBAC_RESOURCES.
 *
 * The route's Sentry telemetry (`help_feature_gate_failure`,
 * `help_search_no_results`) is fully preserved in the handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const helpSearchGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/search',
  request: {
    query: z.object({
      q: z.string().min(2).max(200),
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
});
