/**
 * Document picker search — returns documents in the same community that
 * the calling user can see, filtered by a query string. Used by the editor's
 * "Insert document link" picker.
 *
 * GET /api/v1/documents/drafts/[id]/document-search?communityId=N&q=...&limit=N
 *
 * Plan A1 bundle drain #36. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → requirePermission('documents', 'write')
 *   → draft existence + authorship/admin check
 *   → getAccessibleDocuments(...)  // RLS-aware corpus
 *   → in-memory filter + slice
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` / missing
 * or non-numeric `communityId` / `q` exceeding 200 chars / `limit` out of
 * `[1,50]` shifts to the canonical `VALIDATION_ERROR` envelope. Status
 * unchanged. Success wire shape `{ data: filtered[] }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { getAccessibleDocuments } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { listAllDocumentCategoryNames } from '@/lib/services/document-category-service';
import { getDocumentDraftAuthorship } from '@/lib/services/document-draft-service';
import { documentsDraftsDocumentSearchGetContract } from './contract';

export const runtime = 'nodejs';

export const GET = withErrorHandler(
  runRoute(documentsDraftsDocumentSearchGetContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const draftId = params.id;

    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    // Ensure the draft exists in this community and the caller can edit it
    // (so we don't expose this picker as a side-channel).
    const draft = await getDocumentDraftAuthorship(communityId, draftId);
    if (!draft || draft.deletedAt) throw new NotFoundError('Draft not found');
    const isAuthor = draft.authorId === userId;
    if (!isAuthor && !membership.isAdmin) {
      throw new ForbiddenError('Not authorized for this draft');
    }

    const allRows = (await getAccessibleDocuments({
      communityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
    })) as Array<Record<string, unknown>>;

    const q = (query.q ?? '').trim().toLowerCase();
    const limit = query.limit ?? 20;

    // Resolve category names for display.
    const categoryById = await listAllDocumentCategoryNames(communityId);

    const filtered = (q.length === 0
      ? allRows
      : allRows.filter((r) => String(r['title'] ?? '').toLowerCase().includes(q))
    )
      .slice(0, limit)
      .map((r) => ({
        documentId: Number(r['id']),
        title: String(r['title'] ?? ''),
        category: r['categoryId'] != null ? categoryById.get(Number(r['categoryId'])) ?? null : null,
        mimeType: String(r['mimeType'] ?? ''),
      }));

    return filtered;
  }),
);
