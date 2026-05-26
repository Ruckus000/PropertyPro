/**
 * Route contract for `GET /api/v1/search/documents`.
 *
 * Plan A1 Bundle PR #3, drain #55. Command-palette document search backed by
 * the hardened `searchDocuments` query (the same path used by the documents
 * library), then enriched with friendly category names.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('documents', 'read')
 *     → searchDocuments({ communityId, query, limit, role, communityType, isUnitOwner, permissions })
 *     → getDocumentCategoryNames(communityId, categoryIds)
 *
 * Response intentionally loose (`z.array(z.unknown())` for `results`); rows
 * carry Date fields like `createdAt` that would fail `safeParse` against a
 * tight schema before `NextResponse.json` ISO-serializes them.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchDocumentsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/documents',
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
  permission: { resource: 'documents', action: 'read' },
});
