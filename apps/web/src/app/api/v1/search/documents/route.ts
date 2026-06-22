/**
 * Command-palette document search.
 *
 * GET /api/v1/search/documents
 * Query: { q?, limit?, communityId? }
 *
 * Plan A1 Bundle PR #3, drain #55. Migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for the schema. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('documents', 'read')
 *     → searchDocuments({...})
 *     → getDocumentCategoryNames(communityId, categoryIds)
 *
 * Envelope migration: `{ results, totalCount, status }` → `{ data: {...} }`.
 * `totalCount` preserved as `data.length` (the service returns up to `limit`
 * rows with `nextCursor` but the route shape advertises `data.length`).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchDocuments } from '@propertypro/db';
import { requirePermission } from '@/lib/db/access-control';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';
import { searchDocumentsContract } from './contract';

export const GET = withErrorHandler(
  runRoute(searchDocumentsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'read');

    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 3, 1), 20);

    // Minimum query length: 2 chars for alpha, 1 for numeric
    const isNumeric = /^\d+$/.test(q);
    if (q.length < (isNumeric ? 1 : 2)) {
      return { results: [], totalCount: 0, status: 'ok' as const };
    }

    const { data } = await searchDocuments({
      communityId,
      query: q,
      limit,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
    });

    const categoryIds = Array.from(
      new Set(
        data
          .map((row) => row.categoryId)
          .filter((categoryId): categoryId is number => categoryId != null),
      ),
    );

    const categoryNames = await getDocumentCategoryNames(communityId, categoryIds);

    return {
      results: data.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: categoryNames.get(r.categoryId ?? -1) ?? r.mimeType,
        href: `/documents/${r.id}`,
        entityType: 'document' as const,
        category: r.categoryId != null ? categoryNames.get(r.categoryId) ?? null : null,
        fileType: r.mimeType,
        relevance: r.rank,
      })),
      totalCount: data.length,
      status: 'ok' as const,
    };
  }),
);
