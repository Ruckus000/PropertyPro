/**
 * GET /api/v1/document-categories
 *
 * Lists document categories for a community. Cursor-based keyset pagination
 * via the canonical `paginate()` helper from `@propertypro/db` (Plan B3 pilot;
 * see ADR-003 / Plan A2).
 *
 * Plan A1 pilot: input validation (query) and output validation + canonical
 * envelope wrapping are delegated to `runRoute()` from `@propertypro/api-contract`.
 * The wire response is the canonical double-wrapped paginated envelope:
 *
 *     { data: { data: Category[], pagination: { nextCursor, hasMore, pageSize } } }
 *
 * so consumers can use `requestJson<{ data, pagination }>` and get the right
 * payload. The handler itself returns only the *inner* paginated shape;
 * the runner wraps the outer envelope.
 *
 * The single in-app consumer (`useDocumentCategories`) needs the full list to
 * resolve a category by name; it walks pages until `hasMore` is false. In
 * practice document_categories tables hold ~10–30 rows per community so a
 * single page (default size 50) covers everything.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { paginateDocumentCategories } from '@/lib/services/document-category-service';
import { documentCategoriesListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(documentCategoriesListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await requireCommunityMembership(communityId, userId);

    const result = await paginateDocumentCategories({
      communityId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    // Handler returns the INNER paginated shape; runner builds the outer
    // `{ data: { data: ..., pagination: ... } }` envelope.
    return { data: result.data, pagination: result.pagination };
  }),
);
